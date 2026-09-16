// Paso 3c — el agente aprende a confirmar, cancelar y reagendar, y a pedir el correo.
//
// El motor ya sabía hacer las tres cosas desde el 2026-08-07, pero el agente no tenía
// tools para llamarlas: media agenda era código inalcanzable desde WhatsApp.
//
// Ninguna de las tres le pide `id_cita` al modelo. El motor localiza la cita por teléfono
// —y desambigua con `fecha_texto` si el paciente dijo cuál—. Cada dato que el modelo no
// tiene que llenar es un dato que no puede inventar.
//
// Idempotente.
//
//   node paso3-agente.mjs            ensayo
//   node paso3-agente.mjs --apply    aplica con guardar()
import { n8n, guardar } from './sheets.mjs';

const ID = 'GmGt3g3krJCoDli0';
const MOTOR = 'LsbRqfF2c32hVahw';
const AGENTE = 'Agente de clínica';
const APLICAR = process.argv.includes('--apply');

const TEL = "={{ $('Entrada de mensaje').first().json.body.sender.phone_number }}";
const NOMBRE = "={{ $('Entrada de mensaje').first().json.body.sender.name }}";

const FECHA_GESTION = "={{ $fromAI('fecha_texto', \"LAS PALABRAS DEL PACIENTE sobre DE CUÁL de sus citas habla, copiadas tal cual: \\\"la del jueves\\\", \\\"la de mañana\\\". Dejalo vacío si no dijo cuál o si solo tiene una: la herramienta la encuentra sola por su teléfono. NUNCA pongas una fecha calculada por vos.\", 'string') }}";

const FECHA_NUEVA = "={{ $fromAI('fecha_texto', \"LAS PALABRAS DEL PACIENTE sobre PARA CUÁNDO quiere mover la cita, con día Y hora, copiadas tal cual: \\\"el viernes a las 3 de la tarde\\\". Si el paciente solo confirmó un espacio que vos le propusiste (\\\"sí\\\", \\\"dale\\\"), escribí acá ese espacio completo con día y hora. NUNCA pongas una fecha calculada por vos.\", 'string') }}";

const CAMPOS = ['accion', 'id_servicio', 'fecha_texto', 'telefono', 'nombre_paciente', 'token', 'email'];
const esquema = (usados) => usados.map((c) => ({
  id: c, displayName: c, required: false, defaultMatch: false,
  display: true, canBeUsedToMatch: true, type: 'string',
}));

const tool = (id, nombre, descripcion, valores, pos) => ({
  id,
  name: nombre,
  type: '@n8n/n8n-nodes-langchain.toolWorkflow',
  typeVersion: 2.2,
  position: pos,
  // Sin retryOnFail a propósito: reintentar una gestión re-ejecuta el sub-workflow entero.
  onError: 'continueRegularOutput',
  parameters: {
    description: descripcion,
    workflowId: {
      __rl: true, value: MOTOR, mode: 'list',
      cachedResultName: 'Agenda — disponibilidad y citas',
      cachedResultUrl: `/workflow/${MOTOR}`,
    },
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: valores,
      matchingColumns: [],
      schema: esquema(Object.keys(valores)),
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
  },
});

const NUEVAS = [
  tool('tool-confirmar', 'confirmar_cita',
    `Confirma la asistencia a una cita que el paciente ya tiene agendada.
Usala cuando diga que sí va a ir ("confirmo", "ahí estaré", "sí voy").
NO le pidas cuál cita ni un número de cita: la herramienta la encuentra por su teléfono.
Si devuelve motivo "ambiguo" es que tiene varias; repreguntá con la lista que trae.
Si devuelve "sin_citas", ofrecele agendar una.`,
    { accion: 'confirmar', fecha_texto: FECHA_GESTION, telefono: TEL, nombre_paciente: NOMBRE },
    [1120, 368]),

  tool('tool-cancelar', 'cancelar_cita',
    `Cancela una cita que el paciente ya tiene agendada.
ANTES de llamarla avisale que si faltan menos de 24 horas aplica un cargo de 10.000 colones,
y llamala igual si aun así quiere cancelar: la clínica prefiere saberlo a perder el espacio.
NO le pidas cuál cita ni un número de cita: la herramienta la encuentra por su teléfono.
Si devuelve motivo "ambiguo" es que tiene varias; repreguntá con la lista que trae.`,
    { accion: 'cancelar', fecha_texto: FECHA_GESTION, telefono: TEL, nombre_paciente: NOMBRE },
    [1216, 272]),

  tool('tool-reagendar', 'reagendar_cita',
    `Mueve una cita que el paciente ya tiene a otro día u hora. Es UNA sola llamada: no
canceles y vuelvas a agendar.
En fecha_texto va PARA CUÁNDO la quiere, con día Y hora, en las palabras del paciente.
Consultá disponibilidad antes si no sabés qué espacios hay.
Si devuelve "ambiguo" puede ser que tenga varias citas o que ese día haya varios espacios:
mirá el mensaje y repreguntá con lo que trae.
La cita queda como REPROGRAMADA y la clínica la confirma 24 horas antes.`,
    { accion: 'reagendar', fecha_texto: FECHA_NUEVA, telefono: TEL, nombre_paciente: NOMBRE },
    [1312, 368]),
];

const EMAIL_FROM_AI = "={{ $fromAI('email', \"El correo electrónico del paciente, tal como lo escribió. Dejalo vacío si no lo dio o no lo quiso dar: la cita se agenda igual.\", 'string') }}";

const wf = await n8n(`/workflows/${ID}`);
let cambios = 0;

// ---------- 1. las tres tools nuevas ----------
for (const nodo of NUEVAS) {
  const ya = wf.nodes.find((n) => n.name === nodo.name);
  if (ya) { Object.assign(ya, nodo); console.log(`  = ${nodo.name} (actualizada)`); }
  else { wf.nodes.push(nodo); console.log(`  + ${nodo.name}`); cambios += 1; }
  const c = wf.connections[nodo.name];
  const cableada = (c?.ai_tool?.[0] || []).some((x) => x.node === AGENTE);
  if (!cableada) {
    wf.connections[nodo.name] = { ai_tool: [[{ node: AGENTE, type: 'ai_tool', index: 0 }]] };
    console.log(`  ~ ${nodo.name} → ${AGENTE}`);
    cambios += 1;
  }
}

// ---------- 2. agendar_cita gana el correo ----------
const agendar = wf.nodes.find((n) => n.name === 'agendar_cita');
if (!agendar) throw new Error('no encontré la tool agendar_cita');
const inputs = agendar.parameters.workflowInputs;
if (inputs.value.email) {
  console.log('  = agendar_cita ya pide email');
} else {
  inputs.value.email = EMAIL_FROM_AI;
  inputs.schema = esquema(Object.keys(inputs.value));
  console.log('  + agendar_cita ahora pide email');
  cambios += 1;
}

// ---------- 3. el prompt ----------
const nodoAgente = wf.nodes.find((n) => n.name === AGENTE);
let sm = String(nodoAgente.parameters.options.systemMessage || '');
const antes = sm.length;

const HERRAMIENTAS_VIEJO = `- \`agendar_cita\`: reserva uno de esos espacios.`;
const HERRAMIENTAS_NUEVO = `- \`agendar_cita\`: reserva uno de esos espacios.
- \`confirmar_cita\`: el paciente confirma que va a ir a una cita que ya tiene.
- \`cancelar_cita\`: cancela una cita que ya tiene.
- \`reagendar_cita\`: mueve una cita que ya tiene a otro día u hora, en UNA sola llamada.`;

const GESTION = `
# GESTIONAR UNA CITA QUE YA TIENE
- NUNCA le preguntes CUÁL cita ni le pidas un número de cita: las tres herramientas la
  encuentran por su teléfono. Si el paciente dijo cuál ("la del jueves"), pasá esas
  palabras en \`fecha_texto\`; si no dijo nada, dejalo vacío.
- Si vuelve \`motivo: "ambiguo"\`, tiene varias citas: repreguntá con la lista exacta que
  trae la herramienta, sin elegir vos.
- Si vuelve \`motivo: "sin_citas"\`, no tiene ninguna: ofrecele agendar.
- CANCELAR: antes de llamar a \`cancelar_cita\`, avisale que si faltan menos de 24 horas
  aplica un cargo de 10.000 colones que la clínica cobra en la siguiente visita. Si aun así
  quiere cancelar, cancelá: negarse sería peor, porque igual no va a ir y la clínica pierde
  el espacio. Nunca canceles sin haberle avisado del cargo.
- REAGENDAR: es UNA sola llamada a \`reagendar_cita\`, no cancelar y volver a agendar. En
  \`fecha_texto\` va para cuándo la quiere, con día Y hora.
- CONFIRMAR: la confirmación es solo por acá, por WhatsApp. No le digas que confirme por
  correo ni que haga clic en nada: el correo que recibe es solo un aviso.

# EL CORREO DEL PACIENTE
Antes de llamar a \`agendar_cita\`, pedile el correo electrónico UNA vez, explicándole para
qué: es para enviarle el comprobante de la cita y porque la clínica lo necesita para la
factura electrónica. Si no lo quiere dar, agendá igual y no insistas. Pasalo en \`email\`
tal como lo escribió. Si ya lo teníamos, no se lo vuelvas a pedir.
Al reagendar o cancelar también le llega un correo; no hace falta pedírselo de nuevo.
`;

const ERROR_ANCLA = '- Dar un precio sin haber llamado a `catalogo_servicios` en este mismo turno.';
const ERROR_NUEVO = `${ERROR_ANCLA}
- Cancelar una cita sin haberle avisado antes del cargo de las 24 horas.
- Decirle que no tiene citas sin haber llamado a la herramienta.
- Preguntarle cuál cita quiere gestionar, o inventarte un número de cita.
- Decirle que confirme, reagende o cancele por correo: eso solo se hace por WhatsApp.`;

if (sm.includes('confirmar_cita')) {
  console.log('  = prompt ya menciona las tools de gestión');
} else {
  if (!sm.includes(HERRAMIENTAS_VIEJO)) throw new Error('no encontré el ancla de HERRAMIENTAS');
  sm = sm.replace(HERRAMIENTAS_VIEJO, HERRAMIENTAS_NUEVO);
  if (!sm.includes('\n# SALIDA ESTRUCTURADA')) throw new Error('no encontré el ancla de SALIDA ESTRUCTURADA');
  sm = sm.replace('\n# SALIDA ESTRUCTURADA', `${GESTION}\n# SALIDA ESTRUCTURADA`);
  if (!sm.includes(ERROR_ANCLA)) throw new Error('no encontré el ancla de ERRORES');
  sm = sm.replace(ERROR_ANCLA, ERROR_NUEVO);
  console.log('  + secciones de gestión, correo y 4 errores nuevos');
  nodoAgente.parameters.options.systemMessage = sm;
  cambios += 1;
  console.log(`    systemMessage: ${antes} → ${sm.length} caracteres`);
}

console.log(`\n${cambios} cambio(s).`);
if (!cambios) process.exit(0);
if (!APLICAR) { console.log('Ensayo. Corré con --apply para escribir.'); process.exit(0); }

const despues = await guardar(ID, wf);
console.log(`✓ guardado. active=${despues.active}`);
