// Paso 2 — colgar las dos herramientas de agenda del agente de clínica.
// Sin --apply solo muestra el diff. Con --apply hace el PUT (que PUBLICA el draft).
import { writeFileSync } from 'node:fs';
import { n8n } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const AGENTE = 'GmGt3g3krJCoDli0';
const SUB = 'LsbRqfF2c32hVahw';
const SUB_NOMBRE = 'Agenda — disponibilidad y citas';

const wf = await n8n(`/workflows/${AGENTE}`);
writeFileSync(`backup-${AGENTE}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(wf, null, 2));

if (wf.versionId !== wf.activeVersionId) {
  console.log('⚠️  HAY UN DRAFT SIN PUBLICAR. El PUT lo va a publicar.');
  console.log(`   versionId=${wf.versionId} activeVersionId=${wf.activeVersionId}`);
}

// ---------- 1. Los dos nodos tool ----------
const campos = ['accion', 'id_servicio', 'fecha_texto', 'telefono', 'nombre_paciente'];
const esquema = campos.map((n) => ({
  id: n, displayName: n, required: false, defaultMatch: false, display: true,
  canBeUsedToMatch: true, type: 'string',
}));

// El teléfono y el nombre NO los pone el modelo: salen del payload del webhook, igual que
// los usa "CRM - Enviar a captura de leads". Elimina de raíz que invente un número.
const TELEFONO = "={{ $('Entrada de mensaje').first().json.body.sender.phone_number }}";
const NOMBRE = "={{ $('Entrada de mensaje').first().json.body.sender.name }}";

const DESC_SERVICIO = 'El id del servicio en formato SRV-XXX, sacado de catalogo_servicios. '
  + 'Si no sabés cuál es, llamá primero a catalogo_servicios.';
const DESC_FECHA = 'LAS PALABRAS DEL PACIENTE sobre cuándo quiere la cita, copiadas tal cual '
  + 'y sin traducir: "el martes en la tarde", "la próxima semana", "mañana temprano", '
  + '"dale, el de las 3". NUNCA pongas una fecha calculada por vos como "2026-08-11": '
  + 'la herramienta sabe qué día es hoy y la resuelve sola. Si el paciente no dijo cuándo, '
  + 'dejalo vacío.';

const herramienta = (nombre, accion, descripcion, pos) => ({
  id: `tool-${accion}`,
  name: nombre,
  type: '@n8n/n8n-nodes-langchain.toolWorkflow',
  typeVersion: 2.2,
  position: pos,
  parameters: {
    description: descripcion,
    workflowId: { __rl: true, mode: 'list', value: SUB, cachedResultName: SUB_NOMBRE },
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: {
        accion,
        id_servicio: `={{ $fromAI('id_servicio', ${JSON.stringify(DESC_SERVICIO)}, 'string') }}`,
        fecha_texto: `={{ $fromAI('fecha_texto', ${JSON.stringify(DESC_FECHA)}, 'string') }}`,
        telefono: TELEFONO,
        nombre_paciente: NOMBRE,
      },
      matchingColumns: [],
      schema: esquema,
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
  },
});

const DESC_CONSULTAR = `Dice qué espacios tiene libres la clínica para un servicio.
Devuelve: interpretacion (cómo entendió lo que pidió el paciente, repetíselo para confirmar),
disponible (true/false), alternativas (lista de horarios concretos con fecha, hora y profesional)
y mensaje (redactado, parafrasealo).
Úsala SIEMPRE antes de proponerle un horario a alguien. Nunca inventes horarios ni los copies
de un mensaje anterior de la conversación: los espacios se ocupan.`;

const DESC_AGENDAR = `Reserva uno de los espacios que devolvió consultar_disponibilidad.
En fecha_texto poné el día Y la hora que el paciente confirmó, con sus palabras
("el martes 11 a las 3 de la tarde"). Si solo mandás la hora sin el día y hay varios días
con esa hora, devuelve motivo "ambiguo" y tenés que repreguntar.
La cita queda como SOLICITADA: la clínica la confirma por WhatsApp 24 horas antes.`;

const nuevos = [
  herramienta('consultar_disponibilidad', 'consultar_disponibilidad', DESC_CONSULTAR, [1040, 368]),
  herramienta('agendar_cita', 'agendar', DESC_AGENDAR, [1200, 368]),
];

// ---------- 2. fecha_hoy en Configuración Clínica ----------
const cfg = wf.nodes.find((n) => n.name === 'Configuración Clínica');
const yaTiene = cfg.parameters.assignments.assignments.some((a) => a.name === 'fecha_hoy');
if (!yaTiene) {
  cfg.parameters.assignments.assignments.push({
    id: 'cfg-0019',
    name: 'fecha_hoy',
    type: 'string',
    // No es para que el modelo calcule fechas —de eso se encarga el Code node del
    // sub-workflow— sino para que hable con coherencia y entienda "mañana".
    value: '={{ $now.setZone(\'America/Costa_Rica\').setLocale(\'es\')'
      + '.toFormat("cccc d \'de\' LLLL \'de\' yyyy, HH:mm") }}',
  });
}

// ---------- 3. Prompt ----------
const agente = wf.nodes.find((n) => n.name === 'Agente de clínica');
let prompt = agente.parameters.options.systemMessage;
const reemplazos = [];
const cambiar = (etiqueta, viejo, nuevo) => {
  if (!prompt.includes(viejo)) throw new Error(`no encontré el texto de "${etiqueta}" en el prompt`);
  prompt = prompt.replace(viejo, nuevo);
  reemplazos.push(etiqueta);
};

cambiar('A · herramientas de agenda',
  '- `agenda`: verifica disponibilidad, agenda, reprograma y cancela citas. La\n'
  + '  disponibilidad real proviene de esta herramienta; nunca inventes horarios.',
  '- `consultar_disponibilidad`: qué espacios hay libres para un servicio.\n'
  + '- `agendar_cita`: reserva uno de esos espacios.\n'
  + '  La disponibilidad real proviene SOLO de estas dos herramientas; nunca inventes horarios.');

cambiar('B · sección nueva de agenda',
  '# SALIDA ESTRUCTURADA (OBLIGATORIA)',
  `# CÓMO USAR LA AGENDA
Hoy es {{ $('Configuración Clínica').item.json.fecha_hoy }} (hora de Costa Rica).

- PASALE A LA HERRAMIENTA LO QUE EL PACIENTE DIJO, TEXTUAL. No conviertas "el martes" en
  una fecha vos: la herramienta sabe qué día es hoy y vos no. Copiá sus palabras en
  \`fecha_texto\` ("el martes en la tarde", "la próxima semana", "dale, el de las 3").
- Antes de proponer CUALQUIER horario, llamá a \`consultar_disponibilidad\` en ese mismo
  turno. Nunca ofrezcas un horario de memoria ni copiado de un mensaje anterior.
- Ofrecé DOS O TRES opciones, no las seis que devuelve. En WhatsApp una lista larga mata la
  conversación. Priorizá las del día que pidió el paciente.
- Si un espacio está ocupado, NUNCA lo digas a secas: la herramienta te devuelve
  alternativas en la misma respuesta. Ofrecelas en la misma frase.
- Repetí el campo \`interpretacion\` para confirmar que entendiste ("¿el martes 11 por la
  tarde, entonces?").
- Antes de llamar a \`agendar_cita\`, confirmá con el paciente el servicio, el día, la hora
  y el profesional. Y avisale que la cita queda SOLICITADA hasta que la clínica la
  confirme por WhatsApp 24 horas antes.
- Si vuelve \`motivo: "ambiguo"\`, repreguntá con las opciones que trae. No elijas vos.
- Si vuelve \`motivo: "requiere_valoracion_previa"\`, explicá que primero necesita la
  valoración inicial y llamá a \`consultar_disponibilidad\` con el \`id_servicio_sugerido\`
  que viene en la respuesta, para ofrecerle horarios de valoración en ese mismo turno.
- Si vuelve cualquier otro \`motivo\`, parafraseá el \`mensaje\` y ofrecé las alternativas.

# SALIDA ESTRUCTURADA (OBLIGATORIA)`);

cambiar('C · flujo paso 5',
  '5. Si es agendar → confirma en `catalogo_servicios` que el servicio existe y está activo,\n'
  + '   consulta disponibilidad con `agenda`, propón opciones, recopila nombre y contacto, y\n'
  + '   CONFIRMA la cita antes de cerrarla.',
  '5. Si es agendar → confirma en `catalogo_servicios` que el servicio existe y está activo,\n'
  + '   llama a `consultar_disponibilidad` con las palabras del paciente, ofrece dos o tres\n'
  + '   horarios, y cuando el paciente elija uno, confírmaselo y recién ahí llama a\n'
  + '   `agendar_cita`. Son dos llamadas distintas y las dos son obligatorias.');

cambiar('D · errores nuevos',
  '# ERRORES QUE NO DEBES COMETER\n'
  + '- Dar un precio sin haber llamado a `catalogo_servicios` en este mismo turno.',
  '# ERRORES QUE NO DEBES COMETER\n'
  + '- Proponer un horario sin haber llamado a `consultar_disponibilidad` en este mismo turno.\n'
  + '- Calcular una fecha por tu cuenta. "El martes" lo resuelve la herramienta, no vos.\n'
  + '- Decir que no hay campo sin ofrecer las alternativas que vinieron en la misma respuesta.\n'
  + '- Dar un precio sin haber llamado a `catalogo_servicios` en este mismo turno.');

agente.parameters.options.systemMessage = prompt;

// ---------- 4. Armar el workflow ----------
const yaColgadas = wf.nodes.filter((n) => nuevos.some((x) => x.name === n.name)).map((n) => n.name);
wf.nodes = wf.nodes.filter((n) => !nuevos.some((x) => x.name === n.name)).concat(nuevos);
for (const t of nuevos) {
  wf.connections[t.name] = { ai_tool: [[{ node: 'Agente de clínica', type: 'ai_tool', index: 0 }]] };
}

console.log(`nodos: ${wf.nodes.length} (${yaColgadas.length ? 'reemplazando ' + yaColgadas.join(', ') : '+2 nuevos'})`);
console.log(`fecha_hoy en Configuración Clínica: ${yaTiene ? 'ya estaba' : 'agregado'}`);
console.log('reemplazos en el prompt:', reemplazos.join(' | '));
console.log(`prompt: ${prompt.length} caracteres`);

if (!APPLY) { console.log('\n(dry run — corré con --apply para hacer el PUT)'); process.exit(0); }

// La API pública rechaza settings con claves que ella no conoce (availableInMCP,
// binaryMode), aunque n8n las guarde. Se mandan solo las del esquema; las otras las
// conserva n8n al hacer merge.
const SETTINGS_OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];
const settings = Object.fromEntries(
  Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_OK.includes(k)),
);

const cuerpo = {
  name: wf.name, nodes: wf.nodes, connections: wf.connections,
  settings, staticData: wf.staticData, pinData: wf.pinData,
};
await n8n(`/workflows/${AGENTE}`, { method: 'PUT', body: cuerpo });
console.log('\nPUT hecho (y publicado).');
writeFileSync('system-message-nuevo.txt', prompt);
