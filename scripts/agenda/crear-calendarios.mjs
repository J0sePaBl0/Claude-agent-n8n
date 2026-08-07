// Crea los 4 calendarios de Google (uno por profesional), les pone color, escribe sus ids
// en Profesionales!I2:I5, asigna la credencial al nodo de Calendar y habilita los dos nodos
// del espejo.
//
//   node crear-calendarios.mjs <ID_CREDENCIAL_CALENDAR> [--apply] [--compartir correo@dominio]
//
// Necesita que la credencial googleCalendarOAuth2Api ya exista en n8n (es OAuth: se crea a
// mano en la UI). El ID sale de la URL al editarla: /home/credentials/<ID>.
import { n8n, SID } from './sheets.mjs';

const CRED_ID = process.argv[2];
const APPLY = process.argv.includes('--apply');
const iCompartir = process.argv.indexOf('--compartir');
const COMPARTIR = iCompartir > -1 ? process.argv[iCompartir + 1] : null;
const SUB = 'LsbRqfF2c32hVahw';
const PROXY_PATH = 'calendar-io-tmp';

if (!CRED_ID) { console.error('falta el id de la credencial de Calendar'); process.exit(1); }

// colorId de la calendarList de Google, para que la vista semanal los distinga
const CALENDARIOS = [
  { id: 'PROF-01', nombre: 'Dra. Dulce María Vargas', color: '9',  desc: 'Odontología general, estética, periodoncia y odontopediatría' },
  { id: 'PROF-02', nombre: 'Dra. Carolina Jiménez',   color: '5',  desc: 'Ortodoncia · lunes, miércoles y viernes por la mañana' },
  { id: 'PROF-03', nombre: 'Dr. Andrés Zeledón',      color: '11', desc: 'Endodoncia · martes y jueves' },
  { id: 'PROF-04', nombre: 'Dr. Felipe Arias',        color: '10', desc: 'Cirugía oral e implantología · miércoles tarde y sábados' },
];

const CRED_SHEETS = { googleSheetsOAuth2Api: { id: 'OzuELp4CRMHcSYT8', name: 'trignia automations account' } };
const CRED_CAL = { googleCalendarOAuth2Api: { id: CRED_ID, name: 'Google Calendar account' } };

// --- proxy temporal: webhook -> HTTP Request autenticado contra googleapis ---
async function crearProxy() {
  const http = (nombre, cred, tipo, pos, metodo) => ({
    id: 'p-' + nombre, name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    parameters: {
      method: metodo,
      url: '={{ $json.body.url }}',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: tipo,
      ...(metodo === 'GET' ? {} : {
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.body.payload || {}) }}',
      }),
      options: {},
    },
    credentials: cred,
  });
  const nodes = [
    { id: 'p-wh', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0],
      parameters: { httpMethod: 'POST', path: PROXY_PATH, responseMode: 'lastNode', options: {} } },
    { id: 'p-sw', name: 'Ruta', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [220, 0],
      parameters: {
        rules: { values: ['calPost', 'calPut', 'sheetPut'].map((k) => ({
          conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: k, leftValue: '={{ $json.body.op }}', rightValue: k, operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and' },
          renameOutput: true, outputKey: k,
        })) },
        options: {},
      } },
    http('Calendar POST', CRED_CAL, 'googleCalendarOAuth2Api', [460, -160], 'POST'),
    http('Calendar PUT', CRED_CAL, 'googleCalendarOAuth2Api', [460, 0], 'PUT'),
    http('Sheets PUT', CRED_SHEETS, 'googleSheetsOAuth2Api', [460, 160], 'PUT'),
  ];
  const connections = {
    Entrada: { main: [[{ node: 'Ruta', type: 'main', index: 0 }]] },
    Ruta: { main: [
      [{ node: 'Calendar POST', type: 'main', index: 0 }],
      [{ node: 'Calendar PUT', type: 'main', index: 0 }],
      [{ node: 'Sheets PUT', type: 'main', index: 0 }],
    ] },
  };
  const wf = await n8n('/workflows', { method: 'POST', body: {
    name: 'TEMP — Calendar IO (borrar al terminar)', nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Costa_Rica' },
  } });
  await n8n(`/workflows/${wf.id}/activate`, { method: 'POST', body: {} });
  return wf.id;
}

const llamar = async (body) => {
  const r = await fetch(`https://n8n.trignia.com/webhook/${PROXY_PATH}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`proxy ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
};

if (!APPLY) {
  console.log('Se crearían estos calendarios en la cuenta que autorizó la credencial:');
  CALENDARIOS.forEach((c) => console.log(`  ${c.id}  "${c.nombre}"  color ${c.color}`));
  console.log(COMPARTIR ? `\nY se compartirían con ${COMPARTIR} (permiso de escritura).` : '\n(sin compartir con nadie más)');
  console.log('\n(dry run — corré con --apply)');
  process.exit(0);
}

const proxyId = await crearProxy();
console.log('proxy temporal:', proxyId);
try {
  await new Promise((s) => setTimeout(s, 2500));
  const ids = [];
  for (const c of CALENDARIOS) {
    const cal = await llamar({ op: 'calPost', url: 'https://www.googleapis.com/calendar/v3/calendars',
      payload: { summary: c.nombre, description: c.desc, timeZone: 'America/Costa_Rica' } });
    ids.push(cal.id);
    console.log(`  ${c.id}  ${c.nombre}  ->  ${cal.id}`);

    // color en la vista del usuario
    await llamar({ op: 'calPut', url: `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(cal.id)}`,
      payload: { id: cal.id, colorId: c.color, selected: true } });

    if (COMPARTIR) {
      await llamar({ op: 'calPost', url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/acl`,
        payload: { role: 'writer', scope: { type: 'user', value: COMPARTIR } } });
    }
  }

  await llamar({ op: 'sheetPut',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Profesionales!I2:I5?valueInputOption=RAW`,
    payload: { range: 'Profesionales!I2:I5', majorDimension: 'ROWS', values: ids.map((x) => [x]) } });
  console.log('\nids escritos en Profesionales!I2:I5');
} finally {
  await n8n(`/workflows/${proxyId}`, { method: 'DELETE' });
  console.log('proxy temporal borrado');
}

// --- habilitar el espejo en el sub-workflow ---
const wf = await n8n(`/workflows/${SUB}`);
for (const n of wf.nodes) {
  if (n.name === 'Crear evento en Calendar') {
    n.disabled = false;
    n.credentials = { googleCalendarOAuth2Api: { id: CRED_ID, name: CRED_CAL.googleCalendarOAuth2Api.name } };
  }
  if (n.name === 'Guardar id del evento') n.disabled = false;
}
const OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];
await n8n(`/workflows/${SUB}`, { method: 'PUT', body: {
  name: wf.name, nodes: wf.nodes, connections: wf.connections,
  settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => OK.includes(k))),
  staticData: wf.staticData, pinData: wf.pinData,
} });
const act = await n8n(`/workflows/${SUB}/activate`, { method: 'POST', body: {} });
console.log('espejo habilitado · sub-workflow activo:', act.active);
