// Crea en Postgres la tabla del turno que serializa las escrituras del motor de agenda
// (ver "Tomar turno" / "Liberar turno" en clonar.mjs). Idempotente: CREATE TABLE IF NOT EXISTS.
//
//   node scripts/american-gym/crear-tabla-turno.mjs
//
// n8n no expone SQL por la API, así que arma un workflow temporal (webhook → Postgres) con la
// misma credencial que usa la memoria del agente, lo llama una vez y lo borra.
import { n8n, N8N } from '../agenda/sheets.mjs';

const CRED = { postgres: { id: 'ctiw7NSHBqX5YzqF', name: 'My postgre database' } };
const RUTA = `tmp-crear-turno-${Date.now()}`;
const SQL = `CREATE TABLE IF NOT EXISTS agenda_turno (
  recurso text PRIMARY KEY,
  dueno   text NOT NULL,
  vence   timestamptz NOT NULL
);
SELECT count(*)::int AS filas FROM agenda_turno;`;

const wf = await n8n('/workflows', { method: 'POST', body: {
  name: 'TEMP — crear tabla agenda_turno (borrar)',
  nodes: [
    { id: 'wh', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0], webhookId: RUTA,
      parameters: { httpMethod: 'POST', path: RUTA, responseMode: 'lastNode', options: {} } },
    { id: 'pg', name: 'Crear tabla', type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position: [220, 0], credentials: CRED,
      parameters: { operation: 'executeQuery', query: SQL, options: {} } },
  ],
  connections: { Entrada: { main: [[{ node: 'Crear tabla', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
} });
try {
  await n8n(`/workflows/${wf.id}/activate`, { method: 'POST' });
  const r = await fetch(`${N8N}/webhook/${RUTA}`, { method: 'POST' });
  console.log(r.status, await r.text());
} finally {
  await n8n(`/workflows/${wf.id}`, { method: 'DELETE' });
  console.log('workflow temporal borrado', wf.id);
}
