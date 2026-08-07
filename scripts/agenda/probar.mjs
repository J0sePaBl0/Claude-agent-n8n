// node probar.mjs "quiero agendar una valoracion"
// Simula un mensaje de Chatwoot contra el webhook de producción del agente.
// OJO: manda un WhatsApp real y escribe en Interacciones/Oportunidades del CRM.
const CONTENIDO = process.argv[2] || 'hola';
const ahora = Math.floor(Date.now() / 1000);
const iso = new Date().toISOString();

const sender = {
  additional_attributes: {}, custom_attributes: {}, email: null, id: 5, identifier: null,
  name: 'Jp', phone_number: '+50660181661', thumbnail: '', blocked: false, type: 'contact',
};

const body = {
  account: { id: 2, name: 'Clínica Dental Dulce María' },
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
    account: { id: 2, name: 'Clínica Dental Dulce María' },
  },
  created_at: iso, id: 900,
  inbox: { id: 7, name: 'Agente - Clínica Dental Dulce María' },
  message_type: 'incoming', private: false, sender: { ...sender, avatar: '' },
  event: 'message_created',
};

console.log('enviando:', JSON.stringify(CONTENIDO));
const r = await fetch('https://n8n.trignia.com/webhook/whatsapp-clinica-demo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('webhook →', r.status, (await r.text()).slice(0, 200));
