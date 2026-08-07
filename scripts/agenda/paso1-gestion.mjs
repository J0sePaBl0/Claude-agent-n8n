// Paso 1: agrega confirmar, cancelar y reagendar al motor de agenda.
//
//   node paso1-gestion.mjs [--apply]
//
// Diseño: NO se duplica el motor de espacios. Reagendar reusa `Interpretar la fecha`,
// `Calcular slots libres` y `Resolver slot pedido` tal cual; lo único nuevo es de dónde sale
// el servicio (de la cita, no del modelo) y qué se hace con el resultado.
//
// Las tres acciones comparten una sola cola de escritura, por eso `Preparar gestión` es un
// nodo único con un if adentro y no tres nodos: con tres nombres distintos, la cola no
// podría referenciar al que corrió.
import { readFileSync } from 'node:fs';
import { n8n, guardar, SID } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const SUB = 'LsbRqfF2c32hVahw';
const CRED_SHEETS = { googleSheetsOAuth2Api: { id: 'OzuELp4CRMHcSYT8', name: 'trignia automations account' } };
const CRED_CAL = { googleCalendarOAuth2Api: { id: 'PTFrwFEcqS8cEEKT', name: 'Google Calendar account' } };

const bloques = (archivo) => Object.fromEntries(
  readFileSync(`code/${archivo}`, 'utf8').split(/^\/\/ --- (.+?) ---$/m).slice(1)
    .reduce((acc, x, i, a) => (i % 2 === 0 ? [...acc, [x.trim(), a[i + 1].trim()]] : acc), []));
const G = bloques('gestion.js');

const cond = (izq, der, id) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
  conditions: [{ id, leftValue: izq, rightValue: der, operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and',
});
const code = (name, jsCode, position) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.code',
  typeVersion: 2, position, parameters: { jsCode },
});
const si = (name, izq, der, position) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.if',
  typeVersion: 2.2, position, parameters: { conditions: cond(izq, der, name), options: {} },
});
const conmutar = (name, izq, claves, position) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.switch',
  typeVersion: 3.2, position,
  parameters: {
    rules: { values: claves.map((k) => ({ conditions: cond(izq, k, k), renameOutput: true, outputKey: k })) },
    options: {},
  },
});

const ACCION = "={{ $('Normalizar entrada').first().json.accion }}";

const NUEVOS = [
  code('Localizar cita', readFileSync('code/localizar-cita.js', 'utf8'), [900, 120]),
  si('¿Cita localizada?', '={{ $json.ok }}', 'true', [1080, 120]),
  conmutar('¿Qué acción?', ACCION,
    ['consultar_disponibilidad', 'agendar', 'confirmar', 'cancelar', 'reagendar'], [1620, 120]),
  conmutar('¿Agendar o reagendar?', ACCION, ['agendar', 'reagendar'], [2000, -120]),

  code('Preparar gestión', G['preparar-gestion'], [2200, 420]),
  {
    id: 'aplicar-citas', name: 'Aplicar cambios en Citas', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2, position: [2400, 420], retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    notes: 'values:batchUpdate con RAW. Con USER_ENTERED, Google convierte "08:30" en hora y '
      + 'lo devuelve como "8:30", que no cuadra con el resto de la hoja.',
    parameters: {
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: $json.actualizaciones }) }}",
      options: {},
    },
    credentials: CRED_SHEETS,
  },
  si('¿Borrar evento?', "={{ $('Preparar gestión').first().json.borrar_evento ? 'si' : 'no' }}", 'si', [2600, 420]),
  {
    id: 'borrar-evento', name: 'Borrar evento de Calendar', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2, position: [2800, 320], onError: 'continueRegularOutput',
    retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,
    notes: 'El espejo es presentación, no fuente de verdad: si Calendar falla, la cita ya '
      + 'quedó cancelada o movida en el Sheet y no se debe tumbar la gestión.',
    parameters: {
      method: 'DELETE',
      url: "={{ 'https://www.googleapis.com/calendar/v3/calendars/'"
        + " + encodeURIComponent($('Preparar gestión').first().json.borrar_evento.calendar)"
        + " + '/events/' + $('Preparar gestión').first().json.borrar_evento.id }}",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api',
      options: { response: { response: { neverError: true } } },
    },
    credentials: CRED_CAL,
  },
  si('¿Crear evento?', "={{ $('Preparar gestión').first().json.crear_evento ? 'si' : 'no' }}", 'si', [3000, 420]),
  {
    id: 'crear-evento-reagendado', name: 'Crear evento reagendado', type: 'n8n-nodes-base.googleCalendar',
    typeVersion: 1.3, position: [3200, 320], onError: 'continueRegularOutput',
    retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,
    parameters: {
      resource: 'event', operation: 'create',
      calendar: { __rl: true, mode: 'id', value: "={{ $('Preparar gestión').first().json.crear_evento.calendar }}" },
      start: "={{ $('Preparar gestión').first().json.crear_evento.inicio_iso }}",
      end: "={{ $('Preparar gestión').first().json.crear_evento.fin_iso }}",
      additionalFields: {
        summary: "={{ $('Preparar gestión').first().json.crear_evento.summary }}",
        description: "={{ $('Preparar gestión').first().json.crear_evento.description }}",
      },
    },
    credentials: CRED_CAL,
  },
  {
    id: 'guardar-evento-nuevo', name: 'Guardar id del evento nuevo', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2, position: [3400, 320], onError: 'continueRegularOutput',
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: {
      method: 'PUT',
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Citas!R`
        + "{{ $('Preparar gestión').first().json.fila }}?valueInputOption=RAW",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ values: [[ $json.id ]] }) }}',
      options: {},
    },
    credentials: CRED_SHEETS,
  },
  code('Actividad de gestión', G['actividad-gestion'], [3600, 420]),
  {
    id: 'escribir-actividad-gestion', name: 'Escribir actividad de gestión',
    type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: [3800, 420],
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: SID },
      sheetName: { __rl: true, mode: 'name', value: 'Actividades' },
      columns: { mappingMode: 'autoMapInputData', matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
      options: {},
    },
    credentials: CRED_SHEETS,
  },
  code('Respuesta gestión', G['respuesta-gestion'], [4000, 420]),
];

const CONEXIONES = [
  // la localización va DESPUÉS del resolver de fechas, para poder desambiguar "la del jueves"
  ['Interpretar la fecha', 'Localizar cita', 0],
  ['Localizar cita', '¿Cita localizada?', 0],
  ['¿Cita localizada?', 'Calcular slots libres', 0],
  ['¿Cita localizada?', 'Respuesta', 1],
  ['¿Motor OK?', '¿Qué acción?', 0],
  ['¿Motor OK?', 'Respuesta', 1],
  ['¿Qué acción?', 'Ordenar por cercanía', 0],
  ['¿Qué acción?', 'Validar reglas', 1],
  ['¿Qué acción?', 'Preparar gestión', 2],
  ['¿Qué acción?', 'Preparar gestión', 3],
  ['¿Qué acción?', 'Resolver slot pedido', 4],
  ['¿Slot resuelto?', '¿Agendar o reagendar?', 0],
  ['¿Slot resuelto?', 'Respuesta', 1],
  ['¿Agendar o reagendar?', 'Releer citas frescas', 0],
  ['¿Agendar o reagendar?', 'Preparar gestión', 1],
  ['Preparar gestión', 'Aplicar cambios en Citas', 0],
  ['Aplicar cambios en Citas', '¿Borrar evento?', 0],
  ['¿Borrar evento?', 'Borrar evento de Calendar', 0],
  ['¿Borrar evento?', '¿Crear evento?', 1],
  ['Borrar evento de Calendar', '¿Crear evento?', 0],
  ['¿Crear evento?', 'Crear evento reagendado', 0],
  ['¿Crear evento?', 'Actividad de gestión', 1],
  ['Crear evento reagendado', 'Guardar id del evento nuevo', 0],
  ['Guardar id del evento nuevo', 'Actividad de gestión', 0],
  ['Actividad de gestión', 'Escribir actividad de gestión', 0],
  ['Escribir actividad de gestión', 'Respuesta gestión', 0],
  ['Respuesta gestión', 'Respuesta', 0],
];

// ------------------------------------------------------------------ aplicar
const wf = await n8n(`/workflows/${SUB}`);
const antes = wf.nodes.length;
const log = [];

// 1. campos nuevos en el trigger y en Normalizar entrada
const trig = wf.nodes.find((n) => n.name === 'Cuando el agente llama');
const campos = trig.parameters.workflowInputs.values.map((v) => v.name);
for (const nuevo of ['token', 'email']) {
  if (!campos.includes(nuevo)) {
    log.push(`trigger: campo ${nuevo}`);
    trig.parameters.workflowInputs.values.push({ name: nuevo });
  }
}
const norm = wf.nodes.find((n) => n.name === 'Normalizar entrada');
for (const nuevo of ['token', 'email']) {
  if (!norm.parameters.assignments.assignments.some((a) => a.name === nuevo)) {
    log.push(`Normalizar entrada: ${nuevo}`);
    norm.parameters.assignments.assignments.push({
      id: nuevo, name: nuevo, type: 'string',
      value: `={{ $json.body ? ($json.body.${nuevo} || '') : ($json.${nuevo} || '') }}`,
    });
  }
}

// 2. leer también la columna del token
for (const nombre of ['Leer todo el CRM', 'Releer citas frescas']) {
  const n = wf.nodes.find((x) => x.name === nombre);
  if (n && n.parameters.url.includes('Citas!A%3AR')) {
    n.parameters.url = n.parameters.url.replace('Citas!A%3AR', 'Citas!A%3AS');
    log.push(`${nombre}: Citas A:R → A:S`);
  }
}

// 3. el servicio efectivo sale de "Localizar cita", no de lo que mandó el modelo
const calc = wf.nodes.find((n) => n.name === 'Calcular slots libres');
if (calc.parameters.jsCode.includes("txt(entrada.id_servicio)")) {
  calc.parameters.jsCode = calc.parameters.jsCode.replace(
    'const servicio = servicios.find((s) => txt(s.id_servicio) === txt(entrada.id_servicio));',
    "// Al reagendar, el servicio sale de la CITA localizada, no del modelo: se mueve la\n"
    + '// misma cita y no se inventa otra.\n'
    + "const idServicioEfectivo = txt($('Localizar cita').first().json.id_servicio) || txt(entrada.id_servicio);\n"
    + 'const servicio = servicios.find((s) => txt(s.id_servicio) === idServicioEfectivo);');
  log.push('Calcular slots libres: id_servicio efectivo');
}

// 4. nodos nuevos
for (const nodo of NUEVOS) {
  const i = wf.nodes.findIndex((n) => n.name === nodo.name);
  if (i === -1) { wf.nodes.push(nodo); log.push(`+ nodo ${nodo.name}`); }
  else { wf.nodes[i] = { ...wf.nodes[i], ...nodo }; log.push(`~ nodo ${nodo.name}`); }
}

// 5. fuera el If viejo de dos ramas
const iViejo = wf.nodes.findIndex((n) => n.name === '¿Es agendar?');
if (iViejo > -1) { wf.nodes.splice(iViejo, 1); delete wf.connections['¿Es agendar?']; log.push('- nodo ¿Es agendar?'); }

// 6. Conexiones. Se reescriben SOLO las salidas mencionadas, no el nodo entero: borrar
// `main` completo perdió en la primera pasada las ramas de error de `¿Motor OK?` y
// `¿Slot resuelto?` hacia `Respuesta`, y el webhook empezó a contestar "No item to return
// was found". Lo cazó la red de regresión.
const antesConex = JSON.stringify(wf.connections).length;
const tocadas = new Set(CONEXIONES.map(([o, , s]) => `${o}|${s}`));
for (const clave of tocadas) {
  const [origen, salida] = clave.split('|');
  wf.connections[origen] = wf.connections[origen] || { main: [] };
  while (wf.connections[origen].main.length <= Number(salida)) wf.connections[origen].main.push([]);
  wf.connections[origen].main[Number(salida)] = [];
}
for (const [origen, destino, salida] of CONEXIONES) {
  wf.connections[origen].main[salida].push({ node: destino, type: 'main', index: 0 });
}

// Red de seguridad: ningún nodo que ya existía puede quedar con menos salidas cableadas.
const nombres = new Set(wf.nodes.map((n) => n.name));
const huerfanas = [];
for (const [origen, conex] of Object.entries(wf.connections)) {
  if (!nombres.has(origen)) { huerfanas.push(`conexión desde nodo inexistente: ${origen}`); continue; }
  (conex.main || []).forEach((rama, i) => (rama || []).forEach((t) => {
    if (!nombres.has(t.node)) huerfanas.push(`${origen}[${i}] apunta a ${t.node}, que no existe`);
  }));
}
if (huerfanas.length) { console.error('CONEXIONES ROTAS:'); huerfanas.forEach((h) => console.error('  ✗', h)); process.exit(1); }
console.log(`conexiones: ${antesConex} → ${JSON.stringify(wf.connections).length} bytes`);

console.log('Cambios:');
log.forEach((l) => console.log('  ·', l));
console.log(`\nnodos: ${antes} → ${wf.nodes.length}`);

if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

await guardar(SUB, wf);
const v = await n8n(`/workflows/${SUB}`);
console.log(`\nguardado · activo=${v.active} · publicado=${v.versionId === v.activeVersionId} · nodos=${v.nodes.length}`);
