// La credencial OAuth "Trignia automations email" (Google Drive) está vencida. n8n solo
// valida las credenciales de los nodos TRIGGER al activar, así que deshabilitar los dos
// triggers de Drive alcanza para volver a levantar el workflow.
//
// Es TEMPORAL. Para revertirlo: reconectar la credencial en la UI de n8n y volver a
// habilitar "Archivo creado" y "Archivo actualizado".
import { n8n } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const AGENTE = 'GmGt3g3krJCoDli0';
const TRIGGERS = ['Archivo creado', 'Archivo actualizado'];

const wf = await n8n(`/workflows/${AGENTE}`);
console.log('activo antes:', wf.active);

for (const n of wf.nodes) {
  if (TRIGGERS.includes(n.name)) {
    console.log(`  ${n.disabled ? 'ya estaba deshabilitado' : 'deshabilitando'}: ${n.name} (${n.type})`);
    n.disabled = true;
    n.notes = 'DESHABILITADO 2026-08-05: la credencial OAuth "Trignia automations email" está '
      + 'vencida y bloqueaba la activación del workflow. Reconectala en la UI y volvé a '
      + 'habilitar este nodo para recuperar la sincronización automática del RAG.';
  }
}

if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

const SETTINGS_OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];

await n8n(`/workflows/${AGENTE}`, {
  method: 'PUT',
  body: {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_OK.includes(k))),
    staticData: wf.staticData, pinData: wf.pinData,
  },
});

const r = await n8n(`/workflows/${AGENTE}/activate`, { method: 'POST', body: {} });
console.log('\nACTIVO AHORA:', r.active);
