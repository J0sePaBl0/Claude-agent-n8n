// Crea o borra el workflow proxy de Sheets que usa sheets.mjs.
//   node proxy.mjs crear | borrar
import { n8n } from './sheets.mjs';

const CRED = { googleSheetsOAuth2Api: { id: 'OzuELp4CRMHcSYT8', name: 'trignia automations account' } };
const NOMBRE = 'TEMP — Sheets IO (borrar al terminar)';

const lista = await n8n('/workflows?limit=100');
const existente = lista.data.find((w) => w.name === NOMBRE);

if (process.argv[2] === 'borrar') {
  if (existente) { await n8n(`/workflows/${existente.id}`, { method: 'DELETE' }); console.log('borrado', existente.id); }
  else console.log('no existe');
  process.exit(0);
}

if (existente) { console.log('ya existe:', existente.id); process.exit(0); }

const nodes = [
  { id: 'tmp-wh', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0],
    parameters: { httpMethod: 'POST', path: 'sheets-io-tmp', responseMode: 'lastNode', options: {} } },
  { id: 'tmp-if', name: '¿Es lectura?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [220, 0],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: 'c1', leftValue: '={{ $json.body.method }}', rightValue: 'GET', operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and' }, options: {} } },
  { id: 'tmp-get', name: 'GET Sheets', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [460, -100],
    parameters: { url: '={{ $json.body.url }}', authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api', options: {} }, credentials: CRED },
  { id: 'tmp-post', name: 'POST Sheets', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [460, 100],
    parameters: { method: 'POST', url: '={{ $json.body.url }}', authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api', sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body.payload) }}', options: {} }, credentials: CRED },
];
const connections = {
  Entrada: { main: [[{ node: '¿Es lectura?', type: 'main', index: 0 }]] },
  '¿Es lectura?': { main: [[{ node: 'GET Sheets', type: 'main', index: 0 }], [{ node: 'POST Sheets', type: 'main', index: 0 }]] },
};
const wf = await n8n('/workflows', { method: 'POST', body: {
  name: NOMBRE, nodes, connections, settings: { executionOrder: 'v1', timezone: 'America/Costa_Rica' } } });
await n8n(`/workflows/${wf.id}/activate`, { method: 'POST', body: {} });
console.log('creado y activo:', wf.id);
