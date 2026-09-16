// Prueba de integración de reagendar: agendar → reagendar (correo) → cancelar (limpieza).
// Requiere el proxy: node proxy.mjs crear
import { batchGet, batchUpdate, n8n } from './sheets.mjs';

const URL = 'https://n8n.trignia.com/webhook/agenda-test';
const TEL = '+50660181661';
const CORREO_PRUEBA = 'trigniaautomations@gmail.com';
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

const post = async (b) => {
  const r = await fetch(URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefono: TEL, nombre_paciente: 'Jp', ...b }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`webhook ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
};
const aObj = (filas) => {
  const cab = (filas[0] || []).map((h) => String(h || '').trim());
  return filas.slice(1).map((f, i) => {
    const o = { fila: i + 2 };
    cab.forEach((h, c) => { if (h) o[h] = f[c] ?? ''; });
    return o;
  });
};
const citas = async () => aObj((await batchGet(['Citas!A:S']))['Citas!A:S']);
const pacientes = async () => aObj((await batchGet(['Pacientes!A:Q']))['Pacientes!A:Q']);

const jp = (await pacientes()).find((p) => String(p.telefono).replace(/\D/g, '').endsWith('60181661'));
const emailOriginal = String(jp.email || '');
let idCita = null;

try {
  console.log('── AGENDAR (base para la prueba) ──');
  const ag = await post({
    accion: 'agendar', id_servicio: 'SRV-002',
    fecha_texto: 'el lunes a las 8 de la mañana', email: CORREO_PRUEBA,
  });
  console.log(`  agendada=${ag.agendada}  id_cita=${ag.id_cita}  ${ag.cita?.texto}`);
  if (!ag.agendada) throw new Error(`no se agendó: ${ag.mensaje}`);
  idCita = ag.id_cita;

  await dormir(4000);
  console.log('\n── REAGENDAR ──');
  // Ojo al elegir la hora destino: tiene que existir en la malla. Un turno de 45 min a
  // las 09:30 termina 10:15 y pisa el bloque de urgencias de PROF-01 (10:00-10:30), así
  // que ese espacio NO existe y el motor responde `no_coincide` con toda la razón.
  const destino = process.argv[2] || 'el lunes a las 11 de la mañana';
  console.log(`  destino: "${destino}"`);
  const re = await post({ accion: 'reagendar', id_servicio: '', fecha_texto: destino });
  console.log(`  ok=${re.ok}  motivo=${re.motivo}  agendada=${re.agendada}`);
  console.log(`  mensaje: ${re.mensaje}`);

  await dormir(4000);
  const c = (await citas()).find((x) => x.id_cita === idCita);
  console.log(`  en la hoja: ${c.fecha} ${c.hora_inicio}-${c.hora_fin} · estado ${c.estado}`);
  console.log(`  confirmada_por_paciente=${c.confirmada_por_paciente}  recordatorio=${c.recordatorio_enviado}`);
  console.log(`  notas: ${String(c.notas).slice(-80)}`);
} finally {
  if (idCita) {
    await dormir(4000);
    console.log('\n── CANCELAR (limpieza de la prueba) ──');
    try {
      const ca = await post({ accion: 'cancelar', fecha_texto: '', id_servicio: '' });
      console.log(`  ok=${ca.ok} · ${ca.mensaje.slice(0, 90)}`);
    } catch (e) { console.log('  ⚠️ no se pudo cancelar:', e.message); }
  }
  await dormir(2000);
  await batchUpdate([{ range: `Pacientes!D${jp.fila}`, values: [[emailOriginal]] }]);
  console.log(`✓ Pacientes!D${jp.fila} restaurado a "${emailOriginal}"`);
}

await dormir(3000);
const ej = await n8n('/executions?workflowId=JMZoI1W9QC16LdVK&limit=4&includeData=false');
console.log('\n── ejecuciones del workflow de correos ──');
for (const e of ej.data) console.log(`  ${e.id}  ${e.status}  ${e.startedAt}`);
