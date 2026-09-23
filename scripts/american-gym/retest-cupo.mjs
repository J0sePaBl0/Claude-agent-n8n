// Prepara el caso 6.4 del retest: llena Pilates Reformer (SRV-010, cupo 6) el lunes 5 de octubre
// a las 6:00 a. m. con seis teléfonos ficticios, por el webhook real del motor. Después se pide
// campo desde WhatsApp (grupo `r64` de probar-agente.mjs) y se limpia con `--cancelar`.
//
//   node scripts/american-gym/retest-cupo.mjs            # llena
//   node scripts/american-gym/retest-cupo.mjs --cancelar # cancela a los seis
const URL = 'https://n8n.trignia.com/webhook/agenda-test-american-gym';
const CUPO = 6;
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));
const post = async (b) => (await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
const tel = (n) => `+506 6002-23${String(n).padStart(2, '0')}`;
const CANCELAR = process.argv.includes('--cancelar');

for (let n = 1; n <= CUPO; n++) {
  const r = CANCELAR
    ? await post({ accion: 'cancelar', id_servicio: '', fecha_texto: '', telefono: tel(n) })
    : await post({ accion: 'agendar', id_servicio: 'SRV-010', fecha_texto: 'el lunes 5 de octubre a las 6:00 a.m.', telefono: tel(n), nombre_dictado: `Prueba Retest ${n}` });
  console.log(n, CANCELAR ? (r.ok ? 'cancelada' : r.mensaje) : (r.agendada ? r.id_cita : `${r.motivo}: ${r.mensaje}`));
  await dormir(2500);
}
