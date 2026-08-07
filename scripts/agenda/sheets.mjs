// Proxy hacia la API de Google Sheets a través del workflow temporal de n8n.
// El workflow TEMP — Sheets IO (9zjbfhfi8bDb2v19) expone POST /webhook/sheets-io-tmp
// y reenvía a sheets.googleapis.com con la credencial googleSheetsOAuth2Api.
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(
  'c:/Users/PC/Documents/proyectos-programacion/Claude-agent-n8n/.mcp.json', 'utf8'));
const env = cfg.mcpServers['n8n-mcp'].env;

export const N8N = env.N8N_API_URL.replace(/\/$/, '');
export const KEY = env.N8N_API_KEY;
export const PROXY = `${N8N}/webhook/sheets-io-tmp`;
export const SID = '1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA';

// Google Sheets permite 60 lecturas por minuto por usuario. Una tanda de pruebas la agota
// enseguida y el proxy devuelve un 500 que envuelve el 429 de Google. Sin esto, cualquier
// script largo se cae a la mitad y deja la hoja a medio limpiar.
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

async function call(body, intento = 1) {
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    const esCuota = /too many requests|quota|rate.?limit/i.test(text) || r.status === 429;
    if (intento <= 4) {
      const espera = esCuota ? 15000 : 2000 * intento;
      console.error(`  ⏳ proxy ${r.status}${esCuota ? ' (cuota de Sheets)' : ''}, `
        + `reintento ${intento}/4 en ${espera / 1000}s`);
      await dormir(espera);
      return call(body, intento + 1);
    }
    throw new Error(`proxy ${r.status}: ${text.slice(0, 500)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/** Lee un rango. Devuelve el array de filas (puede venir irregular). */
export async function get(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}`;
  const r = await call({ method: 'GET', url });
  return r.values || [];
}

/** Lee varios rangos de una vez. Devuelve { range: filas }. */
export async function batchGet(ranges) {
  const q = ranges.map((x) => `ranges=${encodeURIComponent(x)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchGet?${q}`;
  const r = await call({ method: 'GET', url });
  const out = {};
  (r.valueRanges || []).forEach((vr, i) => { out[ranges[i]] = vr.values || []; });
  return out;
}

/** Escribe varios rangos de una vez. data = [{ range, values }]. */
export async function batchUpdate(data) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`;
  return call({
    method: 'POST',
    url,
    payload: {
      valueInputOption: 'RAW',
      data: data.map(({ range, values }) => ({ range, majorDimension: 'ROWS', values })),
    },
  });
}

/** Operaciones de estructura (addSheet, etc.). */
export async function structure(requests) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`;
  return call({ method: 'POST', url, payload: { requests } });
}

/** Metadatos de los tabs. */
export async function tabs() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SID}?fields=sheets.properties`;
  const r = await call({ method: 'GET', url });
  return r.sheets.map((s) => s.properties);
}

// La API pública rechaza `settings` con claves que no conoce (`availableInMCP`,
// `binaryMode`) con un 400. Hay que filtrarlas antes de cada PUT.
const SETTINGS_OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];

/**
 * Guarda un workflow por PUT, que además lo PUBLICA.
 *
 * ⚠️ Un PUT sobre un workflow ACTIVO fuerza a n8n a revalidar las credenciales de sus
 * triggers habilitados. Si alguna está vencida, la activación falla y el workflow queda
 * `active: false`. Así se cayó el bot de WhatsApp el 2026-08-05: el trigger de Google Drive
 * tenía la credencial vencida y un PUT inocente lo dejó apagado.
 *
 * Por eso esto aborta si encuentra un trigger habilitado con credenciales, salvo que se
 * pase `{ permitirTriggersConCredencial: true }` a conciencia.
 */
export async function guardar(id, wf, { permitirTriggersConCredencial = false } = {}) {
  const riesgo = wf.nodes.filter((n) => /trigger/i.test(n.type) && !n.disabled
    && n.credentials && Object.keys(n.credentials).length);
  if (riesgo.length && !permitirTriggersConCredencial) {
    throw new Error(`PUT abortado: ${id} tiene triggers habilitados con credencial `
      + `(${riesgo.map((n) => n.name).join(', ')}). Si alguna está vencida, el PUT `
      + 'desactiva el workflow. Deshabilitá esos triggers o pasá permitirTriggersConCredencial.');
  }
  const antes = await n8n(`/workflows/${id}`);
  await n8n(`/workflows/${id}`, { method: 'PUT', body: {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_OK.includes(k))),
    staticData: wf.staticData, pinData: wf.pinData,
  } });
  const despues = await n8n(`/workflows/${id}`);
  if (antes.active && !despues.active) {
    throw new Error(`⚠️ ${id} ESTABA ACTIVO Y QUEDÓ APAGADO tras el PUT. Revisá las `
      + 'credenciales de sus triggers y reactivalo.');
  }
  return despues;
}

/** Llamada directa a la API pública de n8n. */
export async function n8n(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${N8N}/api/v1${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`n8n ${r.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}
