// Lee la última ejecución larga del agente y muestra qué contestó y si llamó a la agenda.
import { n8n } from './sheets.mjs';

const ejec = await n8n('/executions?workflowId=GmGt3g3krJCoDli0&limit=8&includeData=true');
// Un mensaje genera varias ejecuciones (el eco outgoing, los cambios de estado...).
// La que interesa es la que dura segundos, no las de ~100 ms.
const larga = ejec.data
  .map((e) => ({ e, ms: new Date(e.stoppedAt) - new Date(e.startedAt) }))
  .filter((x) => x.ms > 1500)
  .sort((a, b) => new Date(b.e.startedAt) - new Date(a.e.startedAt))[0];

if (!larga) { console.log('no encontré una ejecución larga'); process.exit(0); }

const { e, ms } = larga;
console.log(`ejecución ${e.id} · ${e.status} · ${(ms / 1000).toFixed(1)}s`);

const nodos = e.data?.resultData?.runData || {};
const salida = (n) => nodos[n]?.[0]?.data?.main?.[0]?.[0]?.json;

for (const t of ['consultar_disponibilidad', 'agendar_cita', 'catalogo_servicios']) {
  const corridas = nodos[t]?.length || 0;
  console.log(`  ${t.padEnd(26)} ${corridas ? `LLAMADA ×${corridas}` : '— no la llamó'}`);
}

const ag = salida('Agente de clínica');
if (ag) console.log('\n--- agente ---\n' + JSON.stringify(ag.output ?? ag, null, 2).slice(0, 1400));
const fin = salida('Preparar Mensaje Final');
if (fin) console.log('\n--- lo que recibe el paciente ---\n' + (fin.mensaje_final ?? JSON.stringify(fin)).slice(0, 900));
