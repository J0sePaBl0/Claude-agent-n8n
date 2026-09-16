// Manda un mensaje al agente como si fuera Chatwoot y espera su respuesta.
// A diferencia de probar.mjs, éste espera la ejecución larga y muestra qué contestó
// y qué herramientas usó, en una sola corrida.
//
//   node conversar.mjs "quiero agendar una limpieza"
//   TENANT=american-gym node conversar.mjs "quiero agendar una cita"
//
// OJO: manda un WhatsApp REAL al número de prueba.
import { n8n } from './sheets.mjs';
import { T } from './tenant.mjs';

const AGENTE = T.workflows.agente;
const WEBHOOK = T.webhooks.agente;
const CONTENIDO = process.argv[2];
if (!CONTENIDO) { console.error('falta el mensaje'); process.exit(1); }

const dormir = (ms) => new Promise((s) => setTimeout(s, ms));
const ultimaId = async () => {
  const r = await n8n(`/executions?workflowId=${AGENTE}&limit=1&includeData=false`);
  return r.data[0]?.id ?? 0;
};

const desde = await ultimaId();

const ahora = Math.floor(Date.now() / 1000);
const sender = {
  additional_attributes: {}, custom_attributes: {}, email: null, id: 5, identifier: null,
  name: 'Jp', phone_number: '+50660181661', thumbnail: '', blocked: false, type: 'contact',
};
const body = {
  account: { id: 2, name: T.nombre },
  additional_attributes: {}, content_attributes: {}, content_type: 'text',
  content: CONTENIDO,
  conversation: {
    additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
    contact_inbox: { id: 13, contact_id: 5, inbox_id: 7, source_id: '50660181661' },
    id: 10, inbox_id: 7,
    messages: [{
      id: 900, content: CONTENIDO, account_id: 2, inbox_id: 7, conversation_id: 10,
      message_type: 0, created_at: ahora, private: false, status: 'sent',
      content_type: 'text', content_attributes: {}, sender_type: 'Contact', sender_id: 5,
      conversation: { assignee_id: null, contact_inbox: { source_id: '50660181661' } },
      sender,
    }],
    labels: [],
    meta: { sender, assignee: null, assignee_type: null, team: null, hmac_verified: false },
    status: 'open', custom_attributes: {}, unread_count: 1,
    account: { id: 2, name: T.nombre },
  },
  created_at: new Date().toISOString(), id: 900,
  inbox: { id: 7, name: `Agente - ${T.nombre}` },
  message_type: 'incoming', private: false, sender: { ...sender, avatar: '' },
  event: 'message_created',
};

console.log(`\n👤 ${CONTENIDO}`);
const r = await fetch(`https://n8n.trignia.com/webhook/${WEBHOOK}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
if (!r.ok) throw new Error(`webhook ${r.status}`);

// La ejecución del turno tarda entre 5 y 20 s. Se busca la primera POSTERIOR a la que
// había antes de mandar el mensaje y que además haya llamado al modelo.
let ejec = null;
for (let i = 0; i < 30 && !ejec; i += 1) {
  await dormir(2500);
  const lista = await n8n(`/executions?workflowId=${AGENTE}&limit=6&includeData=true`);
  ejec = lista.data.find((e) => Number(e.id) > Number(desde) && e.stoppedAt
    && e.data?.resultData?.runData?.['Validar Salida del Agente']);
}
if (!ejec) { console.log('⏱️  no llegó respuesta en 75 s'); process.exit(1); }

const rn = ejec.data.resultData.runData;
const usadas = ['catalogo_servicios', 'base_de_datos', 'consultar_disponibilidad',
  'agendar_cita', 'confirmar_cita', 'cancelar_cita', 'reagendar_cita']
  .filter((t) => rn[t]).map((t) => `${t}×${rn[t].length}`);
const val = rn['Validar Salida del Agente'][0].data.main[0][0].json;
const fin = rn['Preparar Mensaje Final']?.[0]?.data?.main?.[0]?.[0]?.json;

console.log(`   [exec ${ejec.id} · tools: ${usadas.join(', ') || 'ninguna'}`
  + `${val.output.escalar ? ` · ESCALÓ (${val.output.motivo_escalamiento})` : ''}]`);
console.log(`🤖 ${fin?.mensaje_final ?? val.output.respuesta}`);
