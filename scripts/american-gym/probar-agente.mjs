// Batería de pruebas conversacionales contra el agente de American Gym.
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/probar-agente.mjs [--limpiar] [grupo...]
//
// Sin argumentos corre todo. Con argumentos corre solo esos grupos: rag, precios, agenda,
// clases, gestion, limites, voz.
//
// OJO, esto NO es un sandbox:
//   · le llega un WhatsApp REAL al +506 6018-1661 por cada turno;
//   · cada turno escribe en `Interacciones` y puede mover `Oportunidades` del CRM;
//   · agendar y cancelar escriben de verdad en `Citas`.
//
// Dos cosas que hay que tener en cuenta antes de correr:
//   1. `¿Bot Puede Responder?` solo deja pasar conversaciones `open`. Cualquier escalamiento
//      la pone en `pending` y a partir de ahí el bot NO vuelve a contestar: el resto de las
//      pruebas darían "no respondió" por una razón que no tiene nada que ver con ellas. Este
//      script lo revisa y lo reabre solo entre turno y turno.
//   2. La memoria del chat es por teléfono y sobrevive entre CORRIDAS (no solo entre
//      grupos): varias invocaciones separadas de este script pueden ser, a propósito, la
//      misma conversación (`agenda` en una llamada y `reservar` en otra, más tarde). Por
//      eso NO se limpia sola: pasá `--limpiar` cuando de verdad quieras arrancar de cero
//      (por ejemplo, para comparar un antes/después).
import { n8n, N8N } from '../agenda/sheets.mjs';
import { T } from '../agenda/tenant.mjs';

const TEL = '+50660181661';
const CUENTA = 2;
const CONVERSACION = 10;
const AGENTE = T.workflows.agente;
const WEBHOOK = T.webhooks.agente;

const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

// ---------------------------------------------------------------- Chatwoot
// El token vive en el Set del agente de Dulce María (de ahí lo sacó la credencial del
// gimnasio). No se imprime nunca.
let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const dm = await n8n('/workflows/GmGt3g3krJCoDli0');
  TOKEN = dm.nodes.find((n) => n.name === 'Configuración Clínica')
    .parameters.assignments.assignments.find((a) => a.name === 'token_chatwoot').value;
  return TOKEN;
}
const chatwoot = async (ruta, opciones = {}) => {
  const r = await fetch(`https://whatsapp.trignia.com/api/v1/accounts/${CUENTA}${ruta}`, {
    ...opciones,
    headers: { 'content-type': 'application/json', api_access_token: await token() },
  });
  if (!r.ok) throw new Error(`chatwoot ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const estado = async () => (await chatwoot(`/conversations/${CONVERSACION}`)).status;
const reabrir = async () => chatwoot(`/conversations/${CONVERSACION}/toggle_status`,
  { method: 'POST', body: JSON.stringify({ status: 'open' }) });

// ---------------------------------------------------------------- memoria del chat
// El header de este archivo prometía limpiar la memoria entre corridas, pero nunca lo
// hacía: solo reabría la conversación. Sin esto, el agente arranca a mitad de una
// conversación vieja y el antes/después de cualquier comparación (de tono, de un fix, lo
// que sea) no compara nada. Se resuelve con un workflow temporal, igual que `proxy.mjs`
// resuelve Sheets: create → activate → call → delete. La credencial de Postgres se lee del
// propio nodo de memoria del agente, no se hardcodea.
async function limpiarMemoria() {
  const wf = await n8n(`/workflows/${AGENTE}`);
  const memoria = wf.nodes.find((n) => n.type === '@n8n/n8n-nodes-langchain.memoryPostgresChat');
  if (!memoria) throw new Error('no encontré el nodo de memoria del agente');
  const cred = memoria.credentials.postgres;
  const tabla = memoria.parameters.tableName;

  const nodes = [
    { id: 'w', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1,
      position: [0, 0],
      parameters: { httpMethod: 'POST', path: 'limpiar-memoria-tmp', responseMode: 'lastNode', options: {} } },
    { id: 'p', name: 'Borrar', type: 'n8n-nodes-base.postgres', typeVersion: 2.6,
      position: [220, 0],
      parameters: { operation: 'executeQuery',
        query: `DELETE FROM ${tabla} WHERE session_id = '${TEL}'`, options: {} },
      credentials: { postgres: cred } },
  ];
  const temp = await n8n('/workflows', { method: 'POST', body: {
    name: 'TEMP - limpiar memoria probar-agente (borrar)', nodes,
    connections: { Entrada: { main: [[{ node: 'Borrar', type: 'main', index: 0 }]] } },
    settings: { executionOrder: 'v1' },
  } });
  await n8n(`/workflows/${temp.id}/activate`, { method: 'POST', body: {} });
  try {
    const r = await fetch(`${N8N}/webhook/limpiar-memoria-tmp`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    if (!r.ok) throw new Error(`limpiar memoria: ${r.status}`);
  } finally {
    await n8n(`/workflows/${temp.id}`, { method: 'DELETE' });
  }
}

// ---------------------------------------------------------------- un turno
const cuerpo = (contenido) => {
  const ahora = Math.floor(Date.now() / 1000);
  const sender = {
    additional_attributes: {}, custom_attributes: {}, email: null, id: 5, identifier: null,
    name: 'Jp', phone_number: TEL, thumbnail: '', blocked: false, type: 'contact',
  };
  return {
    account: { id: CUENTA, name: T.nombre },
    additional_attributes: {}, content_attributes: {}, content_type: 'text',
    content: contenido,
    conversation: {
      additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
      contact_inbox: { id: 13, contact_id: 5, inbox_id: 7, source_id: TEL.replace('+', '') },
      id: CONVERSACION, inbox_id: 7,
      messages: [{
        id: 900, content: contenido, account_id: CUENTA, inbox_id: 7,
        conversation_id: CONVERSACION, message_type: 0, created_at: ahora, private: false,
        status: 'sent', content_type: 'text', content_attributes: {}, sender_type: 'Contact',
        sender_id: 5,
        conversation: { assignee_id: null, contact_inbox: { source_id: TEL.replace('+', '') } },
        sender,
      }],
      labels: [],
      meta: { sender, assignee: null, assignee_type: null, team: null, hmac_verified: false },
      status: 'open', custom_attributes: {}, unread_count: 1,
      account: { id: CUENTA, name: T.nombre },
    },
    created_at: new Date().toISOString(), id: 900,
    inbox: { id: 7, name: `Agente - ${T.nombre}` },
    message_type: 'incoming', private: false, sender: { ...sender, avatar: '' },
    event: 'message_created',
  };
};

const ultimaId = async () => {
  const r = await n8n(`/executions?workflowId=${AGENTE}&limit=1`);
  return Number(r.data[0]?.id ?? 0);
};

const TOOLS = ['catalogo_servicios', 'base_de_datos', 'consultar_disponibilidad',
  'agendar_cita', 'mis_citas', 'confirmar_cita', 'cancelar_cita', 'reagendar_cita'];

async function turno(contenido) {
  if (await estado() !== 'open') { await reabrir(); }
  const desde = await ultimaId();
  const r = await fetch(`${N8N}/webhook/${WEBHOOK}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo(contenido)),
  });
  if (!r.ok) throw new Error(`webhook ${r.status}`);

  let ejec = null;
  for (let i = 0; i < 32 && !ejec; i += 1) {
    await dormir(2500);
    const lista = await n8n(`/executions?workflowId=${AGENTE}&limit=20&includeData=true`);
    ejec = lista.data.find((e) => Number(e.id) > desde && e.stoppedAt
      && e.data?.resultData?.runData?.['Validar Salida del Agente']);
  }
  if (!ejec) return { contenido, error: 'sin respuesta en 80 s' };

  const rn = ejec.data.resultData.runData;
  const val = rn['Validar Salida del Agente'][0].data.main[0][0].json;
  const fin = rn['Preparar Mensaje Final']?.[0]?.data?.main?.[0]?.[0]?.json;

  // Lo que devolvió cada herramienta, para comparar los DATOS contra lo que el agente
  // mandó. Sin esto no hay forma de detectar que "humanizó" y de paso se comió la hora, el
  // precio o el cupo: hay que leerlo a mano contra la respuesta de abajo.
  const salidaTool = (t) => {
    const runs = rn[t];
    const j = runs?.[runs.length - 1]?.data?.ai_tool?.[0]?.[0]?.json
      ?? runs?.[runs.length - 1]?.data?.main?.[0]?.[0]?.json;
    return j?.mensaje ?? null;
  };

  return {
    contenido,
    exec: ejec.id,
    tools: TOOLS.filter((t) => rn[t]).map((t) => `${t}×${rn[t].length}`),
    datosHerramientas: Object.fromEntries(
      TOOLS.filter((t) => rn[t]).map((t) => [t, salidaTool(t)]).filter(([, m]) => m),
    ),
    escalo: val.output.escalar === true,
    motivo: val.output.motivo_escalamiento,
    respuesta: fin?.mensaje_final ?? val.output.respuesta,
  };
}

// ---------------------------------------------------------------- las pruebas
// Los turnos de un mismo grupo dependen del anterior, y varios grupos a propósito
// CONTINÚAN la conversación del grupo previo (ver los comentarios de `reservar`, `clases2`,
// `cerrar`, `reserva3` y `voz2`). Por eso la memoria se limpia UNA VEZ al arrancar el
// script, no entre grupos: quien invoca elige qué lista de grupos corre como una sola
// conversación coherente (`node probar-agente.mjs voz voz2`, por ejemplo).
const GRUPOS = {
  rag: [
    '¿Dónde quedan y a qué hora abren los domingos?',
    '¿Qué clases tienen los sábados y quién las da?',
    '¿A qué número de WhatsApp escribo para preguntar por Pilates?',
    'Necesito que me arreglen el carro, ¿ustedes hacen eso?',
  ],
  precios: [
    '¿Cuánto cuesta la membresía mensual?',
    '¿Y la clase de yoga tiene algún costo aparte?',
    'Quiero apartar la membresía anual entonces',
  ],
  agenda: [
    'Buenas, quiero empezar a entrenar',
    'Sí, la valoración me sirve. ¿Qué tienen disponible?',
  ],
  // Continúa la conversación de `agenda`, que quedó pidiendo nombre y correo.
  reservar: [
    'Juan Pablo Artavia Mora, japartavia@example.com. Me sirve a las 2 de la tarde',
  ],
  clases: [
    'Quiero apartar campo en la clase de yoga',
  ],
  clases2: [
    'Sí, el miércoles a las 6 de la tarde está perfecto',
  ],
  cerrar: [
    'Sí, resérvemela para el miércoles 23 de septiembre a las 6:00 p. m.',
  ],
  reserva2: [
    'Buenas',
    'Quiero apartar campo en la clase de yoga',
    'El miércoles 23 de septiembre a las 6:00 p. m.',
  ],
  reserva3: [
    'Sí, regístrela por favor',
  ],
  arreglos: [
    'Quiero apartar campo en la clase de yoga',
    'El miércoles 23 de septiembre a las 6 p. m. Soy Juan Pablo Artavia Mora, japartavia@example.com',
    '¿Qué citas tengo agendadas?',
  ],
  gestion: [
    '¿Qué citas tengo agendadas?',
    'Cancelame la del yoga por favor',
  ],
  limites: [
    'Me duele la rodilla desde hace días, ¿puedo hacer pierna igual?',
  ],
  // Una conversación sola para medir VOZ, no funcionalidad. Cada turno provoca uno de los
  // defectos observados el 2026-09-16: menú de opciones, catálogo volcado, tres fechas
  // completas seguidas, nombre repetido, muletilla fija y "¿necesita algo más?" automático.
  voz: [
    'Buenas',
    '¿Qué membresías tienen y cuánto valen?',
    '¿Y la clase de yoga cuándo es?',
    'Perfecto, ¿y qué necesito para inscribirme?',
    'Gracias, muy amable',
  ],
  // Va después de `voz`, con la misma memoria. Mide cómo dice el estado de una cita ya
  // hecha ("en estado solicitada" es el defecto que busca). Requiere que exista una cita
  // SOLICITADA para el teléfono de prueba.
  voz2: [
    '¿Qué citas tengo agendadas?',
  ],
};

// ---------------------------------------------------------------- correr
const args = process.argv.slice(2);
const LIMPIAR = args.includes('--limpiar');
const pedidos = args.filter((a) => !a.startsWith('--'));
const grupos = pedidos.length ? pedidos : Object.keys(GRUPOS);

console.log(`Agente: ${AGENTE} · webhook ${WEBHOOK} · conversación ${CONVERSACION}`);
if (LIMPIAR) {
  await limpiarMemoria();
  console.log('memoria del chat limpiada (+50660181661)');
}
console.log(`Estado inicial de la conversación: ${await estado()}\n`);

for (const g of grupos) {
  if (!GRUPOS[g]) { console.log(`(grupo desconocido: ${g})`); continue; }
  console.log(`\n${'='.repeat(70)}\nGRUPO ${g.toUpperCase()}\n${'='.repeat(70)}`);
  for (const mensaje of GRUPOS[g]) {
    const t = await turno(mensaje);
    console.log(`\n👤 ${t.contenido}`);
    if (t.error) { console.log(`   ⚠️  ${t.error}`); continue; }
    console.log(`   [exec ${t.exec} · tools: ${t.tools.join(', ') || 'ninguna'}`
      + `${t.escalo ? ` · ESCALÓ (${t.motivo})` : ''}]`);
    // Lo que devolvió cada herramienta, para poder revisar a mano que ningún dato (hora,
    // precio, cupo, cargo...) se haya perdido al pasar por la redacción del agente.
    for (const [tool, msg] of Object.entries(t.datosHerramientas)) {
      console.log(`   📋 ${tool}: ${msg}`);
    }
    console.log(`🤖 ${t.respuesta}`);
  }
}

console.log(`\n\nEstado final de la conversación: ${await estado()}`);
