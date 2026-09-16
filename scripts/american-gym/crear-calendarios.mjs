// Crea los calendarios de Google Calendar de American Gym — uno por PERSONA real, deduplicado
// (ENT-003 y CLS-BOX-SAB son ambas Julia Acuña; CLS-PIL-PM y CLS-GLUTEOS son ambas Natalie Araya
// Briones), más uno genérico para "el coach de turno" (Virtual Cycling AM/PM y GAP, que en el
// cronograma no tienen instructor fijo). 18 calendarios en total. ENT-009 (Nicole Arguedas
// Carranza, Head Coach) queda SIN calendario a propósito: activo=FALSE en el Sheet, el motor
// nunca la agenda.
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/crear-calendarios.mjs [--apply] [--compartir correo@dominio]
//
// Reusa la credencial googleCalendarOAuth2Api PTFrwFEcqS8cEEKT ("Google Calendar account"): es
// la MISMA cuenta que ya tiene los 4 calendarios de Dulce María (scripts/agenda/crear-calendarios.mjs)
// — coexisten sin chocar, cada uno con su propio nombre y color. Pasá un id distinto como primer
// argumento posicional si hace falta usar otra credencial.
//
// Antes de escribir nada valida que Entrenadores!A2:A24 en el Sheet EN VIVO tenga el mismo orden
// de ids que este archivo asume (el mismo orden en que los escribió cargar-catalogo.mjs) — si
// alguien reordenó filas a mano, aborta en vez de pegar el calendario equivocado en la fila
// equivocada.
//
// No hace PUT sobre el workflow del motor a menos que haga falta: los nodos de Calendar ya están
// habilitados y con la credencial puesta (vinieron así del clon de Dulce María). Un PUT sobre un
// workflow ACTIVO revalida credenciales de sus triggers y puede desactivarlo si alguna está
// vencida (ver memoria n8n_credencial_drive_vencida) — mejor evitarlo si no cambia nada.
import { n8n } from '../agenda/sheets.mjs';
import { T, TENANT } from '../agenda/tenant.mjs';

if (TENANT !== 'american-gym') {
  throw new Error(`Corré con TENANT=american-gym (TENANT actual: "${TENANT}")`);
}
const SID = T.sid;
const MOTOR = T.workflows.motor;
const TAB = T.pestañas.profesionales; // 'Entrenadores'

const argPosicional = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const CRED_ID = argPosicional || 'PTFrwFEcqS8cEEKT';
const APPLY = process.argv.includes('--apply');
const iCompartir = process.argv.indexOf('--compartir');
const COMPARTIR = iCompartir > -1 ? process.argv[iCompartir + 1] : null;
const PROXY_PATH = 'calendar-io-tmp-gym';

// colorId de la calendarList de Google (1-24), solo para distinguir a simple vista en la vista
// combinada.
const CALENDARIOS = {
  mario:      { nombre: 'Mario Cruz Rojas',               color: '1',  desc: 'Entrenamiento de planta — American Gym' },
  andres:     { nombre: 'Andrés Hernández Sáenz',         color: '2',  desc: 'Entrenamiento de planta — American Gym' },
  julia:      { nombre: 'Julia Acuña',                    color: '3',  desc: 'Entrenamiento de planta y American Jungle Box (sábado) — American Gym' },
  norman:     { nombre: 'Norman Arguedas Abarca',         color: '4',  desc: 'Entrenamiento de planta — American Gym' },
  marco:      { nombre: 'Marco Rojas Guzmán',             color: '5',  desc: 'Entrenamiento de planta — American Gym' },
  luis:       { nombre: 'Luis Madrigal Molina',           color: '6',  desc: 'Entrenamiento de planta — American Gym' },
  roy:        { nombre: 'Roy Smith Lewis',                color: '7',  desc: 'Entrenamiento de planta — American Gym' },
  johnathan:  { nombre: 'Johnathan Robles Navarro',       color: '8',  desc: 'Entrenamiento de planta — American Gym' },
  bruna:      { nombre: 'Bruna Braga',                    color: '9',  desc: 'Pilates Reformer (mañana) — American Gym' },
  natalie:    { nombre: 'Natalie Araya Briones',          color: '10', desc: 'Pilates Reformer (tarde) y Glúteos y Piernas — American Gym' },
  hernan:     { nombre: 'Hernán Araneda Spinelli',        color: '11', desc: 'American Jungle Box (mañana) — American Gym' },
  andrei:     { nombre: 'Andrei Quesada Santamaría',      color: '1',  desc: 'American Jungle Box (tarde) — American Gym' },
  patricia:   { nombre: 'Patricia Arias Cordero',         color: '2',  desc: 'Pilates Animal — American Gym' },
  jason:      { nombre: 'Jason Castro Murillo',           color: '3',  desc: 'Full Body — American Gym' },
  ana:        { nombre: 'Ana Barboza',                    color: '4',  desc: 'Yoga — American Gym' },
  omar:       { nombre: 'Omar Guzmán Castro',             color: '5',  desc: 'American Dance — American Gym' },
  juancarlos: { nombre: 'Juan Carlos Meneses Rojas',      color: '6',  desc: 'Military Experience — American Gym' },
  coachturno: { nombre: 'Coach de turno (Cycling / GAP)', color: '7',  desc: 'Virtual Cycling y GAP, sin instructor fijo en el cronograma — American Gym' },
};

// Fila por fila de Entrenadores!A2:A24, en el MISMO orden en que cargar-catalogo.mjs las
// escribió. '' = sin calendario.
const FILAS = [
  ['ENT-001', 'mario'], ['ENT-002', 'andres'], ['ENT-003', 'julia'], ['ENT-004', 'norman'],
  ['ENT-005', 'marco'], ['ENT-006', 'luis'], ['ENT-007', 'roy'], ['ENT-008', 'johnathan'],
  ['ENT-009', ''],
  ['CLS-PIL-AM', 'bruna'], ['CLS-PIL-PM', 'natalie'], ['CLS-BOX-AM', 'hernan'],
  ['CLS-BOX-PM', 'andrei'], ['CLS-BOX-SAB', 'julia'], ['CLS-PILEXP', 'patricia'],
  ['CLS-FULLBODY', 'jason'], ['CLS-YOGA', 'ana'], ['CLS-DANCE', 'omar'],
  ['CLS-GLUTEOS', 'natalie'], ['CLS-CYCLING-AM', 'coachturno'], ['CLS-CYCLING-PM', 'coachturno'],
  ['CLS-MILITARY', 'juancarlos'], ['CLS-GAP', 'coachturno'],
];

const CRED_CAL = { googleCalendarOAuth2Api: { id: CRED_ID, name: 'Google Calendar account' } };
const CRED_SHEETS = { googleSheetsOAuth2Api: { id: 'OzuELp4CRMHcSYT8', name: 'trignia automations account' } };

console.log(`American Gym — ${Object.keys(CALENDARIOS).length} calendarios para ${FILAS.length} filas de ${TAB}:`);
Object.entries(CALENDARIOS).forEach(([k, c]) => {
  const filas = FILAS.filter(([, key]) => key === k).map(([id]) => id);
  console.log(`  ${k.padEnd(11)} "${c.nombre}"  color ${c.color}  <- ${filas.join(', ')}`);
});
const sinCalendario = FILAS.filter(([, key]) => key === '').map(([id]) => id);
if (sinCalendario.length) console.log(`  (sin calendario: ${sinCalendario.join(', ')})`);
console.log(COMPARTIR ? `\nSe compartirían con ${COMPARTIR} (permiso de escritura).` : '\n(sin compartir con nadie más)');

if (!APPLY) {
  console.log('\n(dry run — corré con --apply)');
  process.exit(0);
}

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
        rules: { values: ['calPost', 'calPut', 'calList', 'sheetGet', 'sheetPut'].map((k) => ({
          conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: k, leftValue: '={{ $json.body.op }}', rightValue: k, operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and' },
          renameOutput: true, outputKey: k,
        })) },
        options: {},
      } },
    http('Calendar POST', CRED_CAL, 'googleCalendarOAuth2Api', [460, -320], 'POST'),
    http('Calendar PUT', CRED_CAL, 'googleCalendarOAuth2Api', [460, -160], 'PUT'),
    http('Calendar LIST', CRED_CAL, 'googleCalendarOAuth2Api', [460, 0], 'GET'),
    http('Sheets GET', CRED_SHEETS, 'googleSheetsOAuth2Api', [460, 160], 'GET'),
    http('Sheets PUT', CRED_SHEETS, 'googleSheetsOAuth2Api', [460, 320], 'PUT'),
  ];
  const connections = {
    Entrada: { main: [[{ node: 'Ruta', type: 'main', index: 0 }]] },
    Ruta: { main: [
      [{ node: 'Calendar POST', type: 'main', index: 0 }],
      [{ node: 'Calendar PUT', type: 'main', index: 0 }],
      [{ node: 'Calendar LIST', type: 'main', index: 0 }],
      [{ node: 'Sheets GET', type: 'main', index: 0 }],
      [{ node: 'Sheets PUT', type: 'main', index: 0 }],
    ] },
  };
  const wf = await n8n('/workflows', { method: 'POST', body: {
    name: 'TEMP — Calendar IO Gym (borrar al terminar)', nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Costa_Rica' },
  } });
  await n8n(`/workflows/${wf.id}/activate`, { method: 'POST', body: {} });
  return wf.id;
}

const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

// Reintenta ante blips de red (DNS, timeouts) — lo que tumbó la primera corrida a mitad de
// camino, dejando el proxy vivo y calendarios ya creados que el próximo intento debía reusar.
const llamar = async (body, intento = 1) => {
  let r, t;
  try {
    r = await fetch(`https://n8n.trignia.com/webhook/${PROXY_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    t = await r.text();
  } catch (e) {
    if (intento <= 4) {
      console.error(`  ⏳ red (${e.message}), reintento ${intento}/4 en ${intento * 2}s`);
      await dormir(intento * 2000);
      return llamar(body, intento + 1);
    }
    throw e;
  }
  if (!r.ok) {
    if (intento <= 4) {
      console.error(`  ⏳ proxy ${r.status}, reintento ${intento}/4 en ${intento * 2}s`);
      await dormir(intento * 2000);
      return llamar(body, intento + 1);
    }
    throw new Error(`proxy ${r.status}: ${t.slice(0, 400)}`);
  }
  return JSON.parse(t);
};

const proxyId = await crearProxy();
console.log('\nproxy temporal:', proxyId);
try {
  await new Promise((s) => setTimeout(s, 2500));

  // Sanity check: el orden de filas en el Sheet EN VIVO tiene que coincidir con FILAS, o se
  // pega el calendario equivocado en la fila equivocada.
  const actuales = await llamar({ op: 'sheetGet',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(`${TAB}!A2:A24`)}` });
  const idsActuales = (actuales.values || []).map((f) => f[0]);
  const idsEsperados = FILAS.map(([id]) => id);
  if (JSON.stringify(idsActuales) !== JSON.stringify(idsEsperados)) {
    throw new Error(`Abortado: ${TAB}!A2:A24 no coincide con el orden que este script asume.\n`
      + `  esperado: ${idsEsperados.join(', ')}\n  en vivo:  ${idsActuales.join(', ')}\n`
      + 'Revisá si alguien reordenó filas a mano o corrió cargar-catalogo.mjs con otros datos.');
  }
  console.log('orden de filas verificado contra el Sheet en vivo, OK');

  // Idempotencia: si una corrida anterior se cortó a mitad de camino (como esta, la primera
  // vez — un blip de DNS la tumbó tras crear 8 de 18), no hay que duplicar calendarios. Se
  // busca por nombre exacto entre los que ya son dueños de la cuenta.
  const existentes = await llamar({ op: 'calList',
    url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250' });
  const idPorNombre = {};
  for (const it of (existentes.items || [])) {
    if (it.accessRole === 'owner') idPorNombre[it.summary] = it.id;
  }

  const idPorClave = {};
  for (const [clave, c] of Object.entries(CALENDARIOS)) {
    let calId = idPorNombre[c.nombre];
    if (calId) {
      idPorClave[clave] = calId;
      console.log(`  ${clave.padEnd(11)} ${c.nombre}  ->  ${calId}  (ya existía)`);
    } else {
      const cal = await llamar({ op: 'calPost', url: 'https://www.googleapis.com/calendar/v3/calendars',
        payload: { summary: c.nombre, description: c.desc, timeZone: 'America/Costa_Rica' } });
      calId = cal.id;
      idPorClave[clave] = calId;
      console.log(`  ${clave.padEnd(11)} ${c.nombre}  ->  ${calId}`);
    }

    await llamar({ op: 'calPut', url: `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calId)}`,
      payload: { id: calId, colorId: c.color, selected: true } });

    if (COMPARTIR) {
      try {
        await llamar({ op: 'calPost', url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/acl`,
          payload: { role: 'writer', scope: { type: 'user', value: COMPARTIR } } });
      } catch (e) {
        if (!/duplicate|already exists/i.test(e.message)) throw e;
      }
    }
  }

  const valores = FILAS.map(([, clave]) => [clave ? idPorClave[clave] : '']);
  await llamar({ op: 'sheetPut',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(`${TAB}!I2:I24`)}?valueInputOption=RAW`,
    payload: { range: `${TAB}!I2:I24`, majorDimension: 'ROWS', values: valores } });
  console.log(`\nids escritos en ${TAB}!I2:I24`);
} finally {
  try {
    await n8n(`/workflows/${proxyId}`, { method: 'DELETE' });
    console.log('proxy temporal borrado');
  } catch (e) {
    console.error(`⚠️ no se pudo borrar el proxy temporal ${proxyId} (${e.message}). `
      + `Es un webhook SIN autenticación que proxea a Google — borrarlo a mano: `
      + `node -e "import('./sheets.mjs').then(({n8n})=>n8n('/workflows/${proxyId}',{method:'DELETE'}))"`);
  }
}

// --- confirmar que el motor tiene los nodos de Calendar habilitados y con la credencial ---
// (ya deberían estarlo: vinieron así del clon de Dulce María). Solo hace PUT si hace falta un
// cambio real, para no arriesgar una revalidación de credenciales sobre un workflow activo.
const NODOS_CALENDAR = ['Crear evento en Calendar', 'Guardar id del evento',
  'Crear evento reagendado', 'Guardar id del evento nuevo', 'Borrar evento de Calendar'];
const wf = await n8n(`/workflows/${MOTOR}`);
let cambio = false;
for (const n of wf.nodes) {
  if (!NODOS_CALENDAR.includes(n.name)) continue;
  if (n.disabled) { n.disabled = false; cambio = true; }
  if (n.type === 'n8n-nodes-base.googleCalendar'
      && n.credentials?.googleCalendarOAuth2Api?.id !== CRED_ID) {
    n.credentials = { googleCalendarOAuth2Api: { id: CRED_ID, name: CRED_CAL.googleCalendarOAuth2Api.name } };
    cambio = true;
  }
}
if (!cambio) {
  console.log('nodos de Calendar del motor ya estaban habilitados y con la credencial correcta — sin PUT');
} else {
  const SETTINGS_OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
    'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
    'saveManualExecutions', 'callerPolicy', 'callerIds'];
  await n8n(`/workflows/${MOTOR}`, { method: 'PUT', body: {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_OK.includes(k))),
    staticData: wf.staticData, pinData: wf.pinData,
  } });
  const act = await n8n(`/workflows/${MOTOR}/activate`, { method: 'POST', body: {} });
  console.log('nodos de Calendar corregidos · motor activo:', act.active);
  if (!act.active) console.error('⚠️ EL MOTOR QUEDÓ INACTIVO TRAS EL PUT — revisar credenciales de sus triggers YA.');
}
