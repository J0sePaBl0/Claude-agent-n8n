// Comprueba que `confirmar` NO genera correo: la confirmación vive únicamente en WhatsApp.
// Agenda una cita de prueba, la confirma, cuenta las ejecuciones del workflow de correos
// antes y después, y cancela para dejar la hoja como estaba.
// Requiere el proxy: node proxy.mjs crear
import { batchGet, batchUpdate, n8n } from './sheets.mjs';

const URL = 'https://n8n.trignia.com/webhook/agenda-test';
const TEL = '+50660181661';
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
// Contar ejecuciones NO sirve como aserción: el motor llama al sub-workflow siempre, y
// con `tipo` vacío este corre igual pero se va por la rama "Sin correo del paciente".
// Lo que hay que mirar es si el nodo de Gmail llegó a ejecutarse.
const ultimoCorreo = async () => {
  const r = await n8n('/executions?workflowId=JMZoI1W9QC16LdVK&limit=1&includeData=true');
  const e = r.data[0];
  if (!e) return { id: null, tipo: null, envio: false };
  const rn = e.data.resultData.runData;
  const trig = rn['Cuando el motor llama'][0].data.main[0][0].json;
  return { id: e.id, tipo: trig.tipo, envio: 'Enviar correo al paciente' in rn };
};

const jp = aObj((await batchGet(['Pacientes!A:Q']))['Pacientes!A:Q'])
  .find((p) => String(p.telefono).replace(/\D/g, '').endsWith('60181661'));
const emailOriginal = String(jp.email || '');
let idCita = null;

try {
  const ag = await post({
    accion: 'agendar', id_servicio: 'SRV-002',
    fecha_texto: 'el lunes a las 8 de la mañana', email: 'trigniaautomations@gmail.com',
  });
  if (!ag.agendada) throw new Error(`no se agendó: ${ag.mensaje}`);
  idCita = ag.id_cita;
  console.log(`agendada ${idCita} · ${ag.cita.texto}`);

  await dormir(5000);
  const alAgendar = await ultimoCorreo();
  console.log(`  al agendar → exec ${alAgendar.id} tipo="${alAgendar.tipo}" envió=${alAgendar.envio}`);
  console.log(alAgendar.tipo === 'nueva' && alAgendar.envio
    ? '  ✓ agendar SÍ manda correo'
    : '  ✗ agendar debería mandar un correo tipo "nueva"');

  console.log('\n── CONFIRMAR ──');
  const co = await post({ accion: 'confirmar', fecha_texto: '', id_servicio: '' });
  console.log(`  ok=${co.ok}  motivo=${co.motivo}`);
  console.log(`  mensaje: ${co.mensaje}`);

  await dormir(6000);
  const alConfirmar = await ultimoCorreo();
  console.log(`\n  al confirmar → exec ${alConfirmar.id} tipo="${alConfirmar.tipo}" envió=${alConfirmar.envio}`);
  console.log(!alConfirmar.envio && !alConfirmar.tipo
    ? '  ✓ confirmar NO manda correo: la confirmación vive solo en WhatsApp'
    : '  ✗ confirmar mandó un correo y no debería');

  await dormir(3000);
  const c = aObj((await batchGet(['Citas!A:S']))['Citas!A:S']).find((x) => x.id_cita === idCita);
  console.log(`  en la hoja: estado ${c.estado} · confirmada_por_paciente ${c.confirmada_por_paciente}`);
} finally {
  if (idCita) {
    await dormir(4000);
    try {
      const ca = await post({ accion: 'cancelar', fecha_texto: '', id_servicio: '' });
      console.log(`\n✓ limpieza: ${ca.mensaje.slice(0, 70)}`);
    } catch (e) { console.log('\n⚠️ no se pudo cancelar:', e.message); }
  }
  await dormir(2000);
  await batchUpdate([{ range: `Pacientes!D${jp.fila}`, values: [[emailOriginal]] }]);
  console.log(`✓ Pacientes!D${jp.fila} restaurado a "${emailOriginal}"`);
}
