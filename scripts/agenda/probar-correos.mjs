// Prueba de integración del ciclo completo: agendar → correo → cancelar → correo.
// Escribe de verdad en el Sheet y manda correos de verdad, a la casilla del propio
// proyecto. Restaura el correo del paciente de prueba al terminar.
//
// Requiere el proxy: node proxy.mjs crear
import { batchGet, batchUpdate, n8n } from './sheets.mjs';

const URL = 'https://n8n.trignia.com/webhook/agenda-test';
const TEL = '+50660181661';                       // Jp, PAC-0021
const CORREO_PRUEBA = 'trigniaautomations@gmail.com';
const SERVICIO = 'SRV-002';                        // limpieza: no exige valoración
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

const post = async (b) => {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
const leer = async () => {
  const t = await batchGet(['Citas!A:S', 'Pacientes!A:Q']);
  return { citas: aObj(t['Citas!A:S']), pacientes: aObj(t['Pacientes!A:Q']) };
};

let emailOriginal = null;
let filaPaciente = null;

try {
  const antes = await leer();
  const jp = antes.pacientes.find((p) => String(p.telefono).replace(/\D/g, '').endsWith('60181661'));
  if (!jp) throw new Error('no encontré a Jp en Pacientes');
  emailOriginal = String(jp.email || '');
  filaPaciente = jp.fila;
  console.log(`Jp = ${jp.id_paciente} (fila ${jp.fila}) · email actual: "${emailOriginal}"`);
  console.log(`citas en la hoja antes: ${antes.citas.length}\n`);

  // ---------- 1. agendar ----------
  console.log('── AGENDAR ──');
  const ag = await post({
    accion: 'agendar', id_servicio: SERVICIO,
    fecha_texto: 'el lunes a las 8 de la mañana', email: CORREO_PRUEBA,
  });
  console.log(`  ok=${ag.ok}  agendada=${ag.agendada}  motivo=${ag.motivo}  id_cita=${ag.id_cita}`);
  console.log(`  mensaje: ${ag.mensaje}`);
  if (!ag.agendada) throw new Error('no se agendó; abortando sin cancelar nada');

  await dormir(4000);
  const medio = await leer();
  const nueva = medio.citas.find((c) => c.id_cita === ag.id_cita);
  console.log(`  en la hoja: fila ${nueva.fila} · ${nueva.fecha} ${nueva.hora_inicio} · estado ${nueva.estado}`);
  const jpDespues = medio.pacientes.find((p) => p.fila === filaPaciente);
  console.log(`  Pacientes!D quedó en: "${jpDespues.email}"`);

  // ---------- 2. cancelar ----------
  await dormir(4000);
  console.log('\n── CANCELAR ──');
  const ca = await post({ accion: 'cancelar', fecha_texto: '', id_servicio: '' });
  console.log(`  ok=${ca.ok}  motivo=${ca.motivo}`);
  console.log(`  mensaje: ${ca.mensaje}`);

  await dormir(4000);
  const fin = await leer();
  const cancelada = fin.citas.find((c) => c.id_cita === ag.id_cita);
  console.log(`  en la hoja: estado ${cancelada.estado}`);
  console.log(`  notas: ${String(cancelada.notas).slice(-90)}`);
} finally {
  // ---------- 3. dejar el correo como estaba ----------
  if (filaPaciente !== null) {
    await dormir(2000);
    await batchUpdate([{ range: `Pacientes!D${filaPaciente}`, values: [[emailOriginal]] }]);
    console.log(`\n✓ Pacientes!D${filaPaciente} restaurado a "${emailOriginal}"`);
  }
}

// ---------- 4. ¿se mandaron los correos? ----------
await dormir(3000);
const ej = await n8n('/executions?workflowId=JMZoI1W9QC16LdVK&limit=5&includeData=false');
console.log('\n── ejecuciones del workflow de correos ──');
for (const e of ej.data) console.log(`  ${e.id}  ${e.status}  ${e.startedAt}`);
