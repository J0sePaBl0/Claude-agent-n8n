// Construye (o reconstruye) el sub-workflow "Agenda — disponibilidad y citas".
// Idempotente: si ya existe un workflow con ese nombre, lo actualiza por PUT.
import { readFileSync } from 'node:fs';
import { n8n, SID } from './sheets.mjs';

const NOMBRE = 'Agenda — disponibilidad y citas';
const CRED = { googleSheetsOAuth2Api: { id: 'OzuELp4CRMHcSYT8', name: 'trignia automations account' } };

const src = (f) => readFileSync(`code/${f}`, 'utf8');
const bloques = Object.fromEntries(
  src('filas.js').split(/^\/\/ --- (.+?) ---$/m).slice(1)
    .reduce((acc, x, i, a) => (i % 2 ? acc : [...acc, [x, a[i + 1].trim()]]), []),
);

const doc = { __rl: true, mode: 'id', value: SID, cachedResultName: 'CRM - demo' };
const hoja = (n) => ({ __rl: true, mode: 'name', value: n, cachedResultName: n });

// Los 8 tabs se leen con UN solo values:batchGet. La API de Google permite 60 lecturas
// por minuto por usuario y cada nodo de Sheets gasta ~2: con un nodo por tab, dos
// pacientes conversando a la vez tumbaban la herramienta con un 429.
const RANGOS = ['Servicios!A:N', 'Profesionales!A:I', 'Citas!A:R', 'Feriados!A:B',
  'Config!A:I', 'Pacientes!A:Q', 'Oportunidades!A:R', 'Actividades!A:N'];

const batchGet = (id, nombre, rangos, pos) => ({
  id, name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  executeOnce: true,
  parameters: {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchGet`
      + '?' + rangos.map((r) => 'ranges=' + encodeURIComponent(r)).join('&'),
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleSheetsOAuth2Api',
    options: {},
  },
  credentials: CRED,
});

const code = (id, nombre, archivo, pos) => ({
  id, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
  parameters: { mode: 'runOnceForAllItems', jsCode: typeof archivo === 'string' && archivo.endsWith('.js') ? src(archivo) : archivo },
});

const si = (id, nombre, izq, der, pos) => ({
  id, name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id + '-c', leftValue: izq, rightValue: der, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    options: {},
  },
});

const escribir = (id, nombre, tab, operacion, matching, pos) => ({
  id, name: nombre, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, position: pos,
  parameters: {
    operation: operacion,
    documentId: doc,
    sheetName: hoja(tab),
    columns: {
      mappingMode: 'autoMapInputData',
      matchingColumns: matching || [],
      schema: [],
      attemptToConvertTypes: false,
      convertFieldsToString: true,
    },
    options: {},
  },
  credentials: CRED,
});

const campo = (n) => ({ id: `ne-${n}`, name: n, type: 'string', value: `={{ $json.body ? $json.body.${n} : $json.${n} }}` });

const nodes = [
  {
    id: 'trg-sub', name: 'Cuando el agente llama', type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1, position: [-640, -120],
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: {
        values: [
          { name: 'accion', type: 'string' },
          { name: 'id_servicio', type: 'string' },
          { name: 'fecha_texto', type: 'string' },
          { name: 'telefono', type: 'string' },
          { name: 'nombre_paciente', type: 'string' },
        ],
      },
    },
  },
  {
    id: 'trg-web', name: 'Webhook de prueba', type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1, position: [-640, 100],
    parameters: { httpMethod: 'POST', path: 'agenda-test', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'normalizar', name: 'Normalizar entrada', type: 'n8n-nodes-base.set',
    typeVersion: 3.4, position: [-420, -20],
    parameters: {
      assignments: { assignments: ['accion', 'id_servicio', 'fecha_texto', 'telefono', 'nombre_paciente'].map(campo) },
      options: {},
    },
  },
  batchGet('leer-todo', 'Leer todo el CRM', RANGOS, [-200, -20]),
  code('preparar-datos', 'Preparar datos', 'preparar-datos.js', [-20, -20]),
  code('interpretar', 'Interpretar la fecha', 'interpretar-fecha.js', [180, -20]),
  code('slots', 'Calcular slots libres', 'calcular-slots.js', [900, -20]),
  si('motor-ok', '¿Motor OK?', '={{ $json.ok }}', 'true', [1080, -20]),
  si('es-agendar', '¿Es agendar?', "={{ $('Normalizar entrada').first().json.accion }}", 'agendar', [1260, -120]),
  code('ordenar', 'Ordenar por cercanía', 'ordenar-cercania.js', [1460, -260]),
  code('validar', 'Validar reglas', 'validar-reglas.js', [1460, -20]),
  si('puede', '¿Puede agendar?', '={{ $json.ok }}', 'true', [1640, -20]),
  code('resolver', 'Resolver slot pedido', 'resolver-slot.js', [1820, -120]),
  si('slot-ok', '¿Slot resuelto?', '={{ $json.ok }}', 'true', [2000, -120]),
  // Relectura fresca de Citas justo antes de escribir: Sheets no da atomicidad.
  batchGet('releer', 'Releer citas frescas', ['Citas!A:R'], [2180, -220]),
  code('preparar-frescas', 'Preparar citas frescas',
    "const v = ($input.first().json.valueRanges || [])[0] || {};\n"
    + "const filas = v.values || [];\n"
    + "const cab = (filas[0] || []).map((h) => String(h || '').trim());\n"
    + "const citas = filas.slice(1).map((f) => Object.fromEntries(cab.map((h, i) => [h, f[i] === undefined ? '' : f[i]])));\n"
    + 'return [{ json: { citas } }];', [2360, -220]),
  code('confirmar', 'Confirmar y preparar', 'confirmar-preparar.js', [2540, -220]),
  si('libre', '¿Sigue libre?', '={{ $json.sigue_libre }}', 'true', [3080, -220]),
  code('fila-cita', 'Fila cita', bloques['fila-cita'], [3260, -420]),
  // values:append con RAW en vez del nodo de Sheets: con USER_ENTERED (lo único que
  // hace el nodo) Google convierte "08:30" en una hora y la devuelve como "8:30",
  // inconsistente con las filas que ya tiene la hoja.
  {
    id: 'esc-cita', name: 'Escribir cita', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2, position: [3440, -420],
    parameters: {
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/`
        + `${encodeURIComponent('Citas!A:R')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ values: $json.valores }) }}',
      options: {},
    },
    credentials: CRED,
  },
  code('fila-pac', 'Fila paciente', bloques['fila-paciente'], [3620, -320]),
  escribir('esc-pac', 'Guardar paciente', 'Pacientes', 'appendOrUpdate', ['id_paciente'], [3800, -320]),
  code('fila-act', 'Fila actividad', bloques['fila-actividad'], [3260, -320]),
  escribir('esc-act', 'Escribir actividad', 'Actividades', 'append', [], [3440, -320]),
  // Solo se toca la oportunidad si el CRM ya creó una para ese teléfono; si no,
  // appendOrUpdate con id vacío agregaría una fila basura.
  si('hay-opp', '¿Hay oportunidad?', "={{ $('Confirmar y preparar').first().json.id_oportunidad ? 'si' : 'no' }}", 'si', [3800, -320]),
  code('fila-opp', 'Fila oportunidad', bloques['fila-oportunidad'], [3980, -400]),
  escribir('esc-opp', 'Actualizar oportunidad', 'Oportunidades', 'appendOrUpdate', ['id_oportunidad'], [4160, -400]),
  // --- Espejo en Google Calendar (conectado el 2026-08-07) ---
  // Los DOS nodos van juntos: un nodo deshabilitado deja pasar los datos, así que si se
  // deshabilitara solo el primero, el segundo guardaría un id de evento que nadie creó.
  {
    id: 'calendar', name: 'Crear evento en Calendar', type: 'n8n-nodes-base.googleCalendar',
    typeVersion: 1.3, position: [3620, -420],
    // El espejo es presentación, no fuente de verdad: si Calendar falla, la cita ya quedó
    // registrada en el Sheet y no se debe tumbar la reserva.
    onError: 'continueRegularOutput',
    notes: 'Espejo visual. Los ids de calendario viven en Profesionales!I2:I5.',
    credentials: { googleCalendarOAuth2Api: { id: 'PTFrwFEcqS8cEEKT', name: 'Google Calendar account' } },
    parameters: {
      resource: 'event',
      operation: 'create',
      calendar: { __rl: true, mode: 'id', value: "={{ $('Confirmar y preparar').first().json.id_calendar }}" },
      start: "={{ $('Confirmar y preparar').first().json.inicio_iso }}",
      end: "={{ $('Confirmar y preparar').first().json.fin_iso }}",
      additionalFields: {
        summary: "={{ $('Confirmar y preparar').first().json.servicio }} — {{ $('Confirmar y preparar').first().json.nombre_paciente }}",
        description: "={{ 'id_cita: ' + $('Confirmar y preparar').first().json.id_cita"
          + " + '\\nid_paciente: ' + $('Confirmar y preparar').first().json.id_paciente"
          + " + '\\ntelefono: ' + $('Confirmar y preparar').first().json.telefono }}",
      },
    },
  },
  {
    id: 'guardar-evento', name: 'Guardar id del evento', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2, position: [3800, -420],
    onError: 'continueRegularOutput',
    notes: 'Escribe el id del evento en Citas.id_evento_calendar (columna R) para que '
      + 'reprogramar y cancelar puedan actualizar el mismo evento en vez de duplicarlo.',
    parameters: {
      method: 'PUT',
      // la fila sale del rango que devolvió el append: "Citas!A27:R27" -> 27
      url: `=https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Citas!R`
        + "{{ $('Escribir cita').first().json.updates.updatedRange.match(/(\\d+)/)[0] }}"
        + '?valueInputOption=RAW',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ values: [[ $json.id ]] }) }}',
      options: {},
    },
    credentials: CRED,
  },
  code('resp-agendada', 'Respuesta agendada', bloques['respuesta-agendada'], [4520, -420]),
  code('respuesta', 'Respuesta', bloques['respuesta'], [4740, 60]),
  {
    id: 'sticky', name: 'Documentación', type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1, position: [-680, -560], parameters: {
      width: 900, height: 400, color: 4,
      content: readFileSync('code/sticky.md', 'utf8'),
    },
  },
];

const c = (desde, destinos, salida = 0) => ({ [desde]: { main: [] } });
const connections = {};
const conectar = (desde, destino, salida = 0) => {
  connections[desde] = connections[desde] || { main: [] };
  while (connections[desde].main.length <= salida) connections[desde].main.push([]);
  connections[desde].main[salida].push({ node: destino, type: 'main', index: 0 });
};

conectar('Cuando el agente llama', 'Normalizar entrada');
conectar('Webhook de prueba', 'Normalizar entrada');
conectar('Normalizar entrada', 'Leer todo el CRM');
conectar('Leer todo el CRM', 'Preparar datos');
conectar('Preparar datos', 'Interpretar la fecha');
conectar('Interpretar la fecha', 'Calcular slots libres');
conectar('Calcular slots libres', '¿Motor OK?');
conectar('¿Motor OK?', '¿Es agendar?', 0);
conectar('¿Motor OK?', 'Respuesta', 1);
conectar('¿Es agendar?', 'Validar reglas', 0);
conectar('¿Es agendar?', 'Ordenar por cercanía', 1);
conectar('Ordenar por cercanía', 'Respuesta');
// La regla de valoración previa (Validar reglas) va ANTES de resolver el espacio: no
// depende de la hora, y si corriera después, pedir una limpieza a una hora inexistente
// devolvería "ese espacio no está" sin llegar a decir que falta la valoración.
conectar('Validar reglas', '¿Puede agendar?');
conectar('¿Puede agendar?', 'Resolver slot pedido', 0);
conectar('¿Puede agendar?', 'Respuesta', 1);
conectar('Resolver slot pedido', '¿Slot resuelto?');
conectar('¿Slot resuelto?', 'Releer citas frescas', 0);
conectar('¿Slot resuelto?', 'Respuesta', 1);
conectar('Releer citas frescas', 'Preparar citas frescas');
conectar('Preparar citas frescas', 'Confirmar y preparar');
conectar('Confirmar y preparar', '¿Sigue libre?');
conectar('¿Sigue libre?', 'Fila cita', 0);
conectar('¿Sigue libre?', 'Respuesta', 1);
conectar('Fila cita', 'Escribir cita');
conectar('Escribir cita', 'Fila paciente');
conectar('Fila paciente', 'Guardar paciente');
conectar('Guardar paciente', 'Fila actividad');
conectar('Fila actividad', 'Escribir actividad');
// Cadena lineal a propósito: con responseMode=lastNode el webhook devuelve lo que salga
// del último nodo que ejecute, así que "Respuesta" tiene que ser el final de todo.
// Un nodo deshabilitado deja pasar los datos, así que Calendar no rompe la cadena.
conectar('Escribir actividad', 'Crear evento en Calendar');
conectar('Crear evento en Calendar', 'Guardar id del evento');
conectar('Guardar id del evento', '¿Hay oportunidad?');
conectar('¿Hay oportunidad?', 'Fila oportunidad', 0);
conectar('¿Hay oportunidad?', 'Respuesta agendada', 1);
conectar('Fila oportunidad', 'Actualizar oportunidad');
conectar('Actualizar oportunidad', 'Respuesta agendada');
conectar('Respuesta agendada', 'Respuesta');

const cuerpo = {
  name: NOMBRE,
  nodes,
  connections,
  // Sin esto $now sale en UTC y todos los slots se corren 6 horas.
  settings: { executionOrder: 'v1', timezone: 'America/Costa_Rica' },
};

const lista = await n8n('/workflows?limit=100');
const existente = lista.data.find((w) => w.name === NOMBRE);

if (existente) {
  await n8n(`/workflows/${existente.id}`, { method: 'PUT', body: cuerpo });
  console.log(`actualizado: ${existente.id}  (${nodes.length} nodos)`);
} else {
  const r = await n8n('/workflows', { method: 'POST', body: cuerpo });
  console.log(`creado: ${r.id}  (${nodes.length} nodos)`);
}
