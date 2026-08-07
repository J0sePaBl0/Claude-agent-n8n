// Arregla el bug del 2026-08-07: el agente ofrecía el jueves 13 a las 4:00 p. m., el
// paciente decía "deseo reservar si", y el agente contestaba que ese espacio ya no estaba
// disponible — siendo que seguía libre.
//
// Tres capas:
//   1. prompt — al confirmar, `fecha_texto` lleva día Y hora, no el "sí" del paciente
//   2. prompt — `ambiguo` no significa ocupado; prohibido afirmar que algo se tomó
//   3. motor  — el fallback de `ambiguo` reparte las horas a lo largo del día
//
//   node arreglar-ambiguo.mjs [--apply]
import { readFileSync } from 'node:fs';
import { n8n } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const AGENTE = 'GmGt3g3krJCoDli0';
const SUB = 'LsbRqfF2c32hVahw';

const OK_SETTINGS = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];

const guardar = async (id, wf) => n8n(`/workflows/${id}`, { method: 'PUT', body: {
  name: wf.name, nodes: wf.nodes, connections: wf.connections,
  settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => OK_SETTINGS.includes(k))),
  staticData: wf.staticData, pinData: wf.pinData,
} });

// ---------------------------------------------------------------- prompt
const REEMPLAZOS = [
  // 1. la causa raíz: el turno de confirmación no trae ni día ni hora
  { que: 'regla del turno de confirmación',
    de: '- PASALE A LA HERRAMIENTA LO QUE EL PACIENTE DIJO, TEXTUAL. No conviertas "el martes" en\n'
      + '  una fecha vos: la herramienta sabe qué día es hoy y vos no. Copiá sus palabras en\n'
      + '  `fecha_texto` ("el martes en la tarde", "la próxima semana", "dale, el de las 3").',
    a: '- PASALE A LA HERRAMIENTA LO QUE EL PACIENTE DIJO, TEXTUAL. No conviertas "el martes" en\n'
      + '  una fecha vos: la herramienta sabe qué día es hoy y vos no. Copiá sus palabras en\n'
      + '  `fecha_texto` ("el martes en la tarde", "la próxima semana", "dale, el de las 3").\n'
      + '- ÚNICA EXCEPCIÓN, Y ES OBLIGATORIA: cuando el paciente solo CONFIRMA el espacio que vos\n'
      + '  le propusiste ("sí", "dale", "perfecto", "deseo reservar"), sus palabras no traen ni\n'
      + '  día ni hora. Ahí NO copies el "sí": escribí en `fecha_texto` el espacio completo que\n'
      + '  acabás de confirmarle, con día Y HORA ("el jueves 13 de agosto a las 4:00 p. m.").\n'
      + '  Si mandás solo el día, la herramienta no sabe a cuál de los espacios de ese día te\n'
      + '  referís y la reserva no se hace.' },

  // 2. ambiguo ≠ ocupado, y cómo recuperarse solo
  { que: 'regla de `ambiguo`',
    de: '- Si vuelve `motivo: "ambiguo"`, repreguntá con las opciones que trae. No elijas vos.',
    a: '- Si vuelve `motivo: "ambiguo"`, quiere decir que la herramienta no supo A CUÁL de los\n'
      + '  espacios de ese día te referías. NO quiere decir que el espacio esté ocupado: sigue\n'
      + '  libre. Si el paciente ya había elegido una hora concreta, volvé a llamar a\n'
      + '  `agendar_cita` en este mismo turno poniendo el día Y esa hora en `fecha_texto`. Solo\n'
      + '  si de verdad no había elegido hora, repreguntá con las opciones que trae, sin elegir\n'
      + '  vos y aclarando que son ejemplos y que hay más.' },

  // 3. el freno duro contra la alucinación observada
  { que: 'error nuevo en ERRORES QUE NO DEBES COMETER',
    de: '- Decir que no hay campo sin ofrecer las alternativas que vinieron en la misma respuesta.',
    a: '- Decir que no hay campo sin ofrecer las alternativas que vinieron en la misma respuesta.\n'
      + '- Decirle al paciente que un espacio "ya no está disponible" cuando la herramienta no lo\n'
      + '  dijo. Solo podés afirmarlo si el `motivo` que volvió es "no_coincide". Con "ambiguo"\n'
      + '  el espacio sigue libre y lo único que falta es que aclares cuál.' },
];

const wfAg = await n8n(`/workflows/${AGENTE}`);
const nodoAg = wfAg.nodes.find((n) => n.name === 'Agente de clínica');
let prompt = nodoAg.parameters.options.systemMessage;
const antes = prompt.length;

for (const r of REEMPLAZOS) {
  const veces = prompt.split(r.de).length - 1;
  if (veces !== 1) throw new Error(`"${r.que}": el texto a reemplazar aparece ${veces} veces, esperaba 1`);
  prompt = prompt.replace(r.de, r.a);
  console.log(`  ✓ ${r.que}`);
}
console.log(`\nprompt: ${antes} -> ${prompt.length} chars (+${prompt.length - antes})`);

// ---------------------------------------------------------------- motor
const wfSub = await n8n(`/workflows/${SUB}`);
const nodoRes = wfSub.nodes.find((n) => n.name === 'Resolver slot pedido');
const codigoNuevo = readFileSync('code/resolver-slot.js', 'utf8');
const cambiaCodigo = nodoRes.parameters.jsCode !== codigoNuevo;
console.log(`\nmotor "Resolver slot pedido": ${cambiaCodigo ? 'cambia' : 'ya estaba al día'}`);

// red de seguridad: el PUT sobre un workflow activo revalida las credenciales de los
// triggers, y un trigger con credencial vencida lo DESACTIVA (pasó el 2026-08-05)
for (const [id, wf] of [[AGENTE, wfAg], [SUB, wfSub]]) {
  const riesgo = wf.nodes.filter((n) => /trigger/i.test(n.type) && !n.disabled && n.credentials);
  if (riesgo.length) console.log(`  ⚠ ${id}: triggers con credencial activos ->`, riesgo.map((n) => n.name).join(', '));
}

if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

nodoAg.parameters.options.systemMessage = prompt;
nodoRes.parameters.jsCode = codigoNuevo;
await guardar(SUB, wfSub);
console.log('\nsub-workflow guardado');
await guardar(AGENTE, wfAg);
console.log('agente guardado');

for (const [n, id] of [['agente', AGENTE], ['sub-workflow', SUB]]) {
  const v = await n8n(`/workflows/${id}`);
  console.log(`  ${n}: activo=${v.active} · publicado=${v.versionId === v.activeVersionId}`);
}
