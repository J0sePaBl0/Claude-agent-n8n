// Compacta el tab Citas: borra las filas vacías intercaladas y, opcionalmente, una cita
// concreta junto con su evento de Google Calendar.
//
//   node compactar-citas.mjs [--borrar CITA-0027] [--apply]
//
// Por qué importa: values:append cae después de la última fila con datos. Con filas vacías
// intercaladas, cada cita nueva se aleja más y la hoja se ve rota en el demo.
import { batchGet, structure, tabs, n8n } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const iBorrar = process.argv.indexOf('--borrar');
const BORRAR = iBorrar > -1 ? process.argv[iBorrar + 1] : null;
const CRED_CAL_ID = 'PTFrwFEcqS8cEEKT';
const PROXY_PATH = 'cal-del-tmp';

const props = await tabs();
const sheetId = props.find((p) => p.title === 'Citas').sheetId;

const filas = (await batchGet(['Citas!A:R']))['Citas!A:R'];
const vacias = [];
let aBorrar = null;
filas.forEach((f, i) => {
  if (i === 0) return;
  const tiene = (f || []).some((c) => String(c ?? '').trim());
  if (!tiene) vacias.push(i);                       // índice 0-based para deleteDimension
  else if (BORRAR && f[0] === BORRAR) aBorrar = { idx: i, fila: f };
});

console.log(`Citas: ${filas.length} filas leídas`);
console.log(`  vacías a eliminar: ${vacias.length}${vacias.length ? ` (filas ${vacias[0] + 1}–${vacias[vacias.length - 1] + 1})` : ''}`);
if (BORRAR) {
  console.log(aBorrar
    ? `  cita a borrar: ${BORRAR} en fila ${aBorrar.idx + 1}, evento "${aBorrar.fila[17] || '(sin evento)'}"`
    : `  cita ${BORRAR} no encontrada`);
}

if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

// 1. borrar el evento de Calendar, si lo tiene
if (aBorrar && aBorrar.fila[17]) {
  const idCal = aBorrar.fila[2];
  const prof = (await batchGet(['Profesionales!A:I']))['Profesionales!A:I'];
  const cal = (prof.find((p) => p[0] === idCal) || [])[8];
  if (cal) {
    const wf = await n8n('/workflows', { method: 'POST', body: {
      name: 'TEMP — Calendar delete', settings: { executionOrder: 'v1' },
      nodes: [
        { id: 'w', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0],
          parameters: { httpMethod: 'POST', path: PROXY_PATH, responseMode: 'lastNode', options: {} } },
        { id: 'd', name: 'Borrar', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0],
          parameters: { method: 'DELETE', url: '={{ $json.body.url }}',
            authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api',
            options: { response: { response: { neverError: true, fullResponse: true } } } },
          credentials: { googleCalendarOAuth2Api: { id: CRED_CAL_ID, name: 'Google Calendar account' } } },
      ],
      connections: { Entrada: { main: [[{ node: 'Borrar', type: 'main', index: 0 }]] } },
    } });
    await n8n(`/workflows/${wf.id}/activate`, { method: 'POST', body: {} });
    await new Promise((s) => setTimeout(s, 2500));
    const r = await fetch(`https://n8n.trignia.com/webhook/${PROXY_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${aBorrar.fila[17]}` }),
    });
    console.log('  evento borrado de Calendar →', (await r.text()).slice(0, 120));
    await n8n(`/workflows/${wf.id}`, { method: 'DELETE' });
  }
}

// 2. borrar filas, de abajo hacia arriba para no correr los índices
const idx = [...vacias, ...(aBorrar ? [aBorrar.idx] : [])].sort((a, b) => b - a);
if (idx.length) {
  await structure(idx.map((i) => ({
    deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } },
  })));
  console.log(`  ${idx.length} filas eliminadas`);
}

const despues = (await batchGet(['Citas!A:R']))['Citas!A:R'];
console.log(`\nCitas ahora: ${despues.length - 1} filas de datos, última: ${despues[despues.length - 1][0]}`);
