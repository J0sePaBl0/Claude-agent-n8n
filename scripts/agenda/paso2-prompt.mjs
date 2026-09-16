// Paso 2b — el prompt del agente aprende a leer el contexto del paciente.
//
// El motor ya devuelve `paciente_existente`, `valoracion`, `citas_proximas` y `aviso`
// (paso2-contexto.mjs). Falta que el agente sepa que existen y deje de deducir la regla
// de la columna `requiere_valoracion` de `catalogo_servicios`, que habla del SERVICIO y
// no de la persona.
//
// El reparto es a propósito: la POLÍTICA es estable y vive en el prompt; el ESTADO del
// paciente cambia a cada rato y vive en la herramienta. Ninguno de los dos adivina.
//
// Idempotente: si los textos ya están, no hace nada.
//
//   node paso2-prompt.mjs            ensayo
//   node paso2-prompt.mjs --apply    aplica con guardar()
import { n8n, guardar } from './sheets.mjs';

const ID = 'GmGt3g3krJCoDli0';
const NODO = 'Agente de clínica';
const APLICAR = process.argv.includes('--apply');

const SECCION = `# REGLA DE VALORACIÓN INICIAL
Son DOS reglas distintas y no se mezclan:
- PACIENTE NUEVO: quien nunca ha sido atendido en la clínica pasa primero por una
  valoración inicial, sea cual sea el servicio que pida.
- SERVICIO: algunos tratamientos exigen valoración previa aunque el paciente ya sea
  conocido. Esta se levanta cuando la valoración YA SE HIZO, no cuando solo está agendada.
NUNCA decidas si a ESTE paciente le aplica leyendo \`requiere_valoracion\` de
\`catalogo_servicios\`: esa columna habla del SERVICIO, no de la persona. Quien sabe el
estado del paciente es la agenda, en los campos que devuelven \`consultar_disponibilidad\`
y \`agendar_cita\`:
- \`paciente_existente\`: si ya está registrado en la clínica.
- \`valoracion\`: { estado: "ninguna" | "agendada" | "realizada", texto }.
- \`citas_proximas\`: las citas que ya tiene por delante.
- \`aviso\`: lo que hay que decirle SIN que lo pida, ya redactado. Si viene con texto,
  decíselo ANTES de ofrecerle horarios.
- \`nota_valoracion\`: dónde está ESTE paciente respecto de la regla, en una frase. Es la
  respuesta cuando pregunte si necesita valoración o si puede agendar sin ella. Decila con
  tus palabras; no la deduzcas del catálogo ni de tu memoria.
Si te preguntan si hace falta valoración, respondé con esos campos, nunca de memoria ni
del catálogo. Y si \`citas_proximas\` trae algo, mencionáselo antes de agendarle otra cita.

`;

// La v1 de la sección no tenía `nota_valoracion`. Este reemplazo la actualiza en sitio.
const AVISO_V1 = `- \`aviso\`: la explicación YA REDACTADA. Si viene con texto, decíselo al paciente ANTES de
  ofrecerle horarios: es lo que necesita para decidir.`;
const AVISO_V2 = `- \`aviso\`: lo que hay que decirle SIN que lo pida, ya redactado. Si viene con texto,
  decíselo ANTES de ofrecerle horarios.
- \`nota_valoracion\`: dónde está ESTE paciente respecto de la regla, en una frase. Es la
  respuesta cuando pregunte si necesita valoración o si puede agendar sin ella. Decila con
  tus palabras; no la deduzcas del catálogo ni de tu memoria.`;

const VIEJO_MOTIVO = `- Si vuelve \`motivo: "requiere_valoracion_previa"\`, explicá que primero necesita la
  valoración inicial y llamá a \`consultar_disponibilidad\` con el \`id_servicio_sugerido\`
  que viene en la respuesta, para ofrecerle horarios de valoración en ese mismo turno.`;

const NUEVO_MOTIVO = `${VIEJO_MOTIVO}
  Si \`id_servicio_sugerido\` viene en null es porque el paciente YA tiene su valoración
  agendada: no consultés nada, decile cuándo es y que el tratamiento va después de esa.`;

const ANCLA_SECCION = '\n# CÓMO USAR LA AGENDA\n';

const VIEJO_ERROR = '- Dar un precio sin haber llamado a `catalogo_servicios` en este mismo turno.';
const NUEVO_ERROR = `${VIEJO_ERROR}
- Afirmar que a un paciente le hace falta —o no— una valoración leyendo el catálogo. Eso
  lo dice la agenda, en \`paciente_existente\` y \`valoracion\`.
- Agendarle una cita sin mencionarle las que ya tiene, cuando vinieron en \`citas_proximas\`.`;

const wf = await n8n(`/workflows/${ID}`);
const nodo = wf.nodes.find((n) => n.name === NODO);
if (!nodo) throw new Error(`no encontré el nodo "${NODO}"`);

let sm = String(nodo.parameters.options.systemMessage || '');
const original = sm;
const antes = sm.length;

// 1. la sección nueva, justo antes de CÓMO USAR LA AGENDA
if (sm.includes('# REGLA DE VALORACIÓN INICIAL')) {
  console.log('  = sección de valoración ya presente');
} else {
  if (!sm.includes(ANCLA_SECCION)) throw new Error('no encontré el ancla "# CÓMO USAR LA AGENDA"');
  sm = sm.replace(ANCLA_SECCION, `\n${SECCION}# CÓMO USAR LA AGENDA\n`);
  console.log('  + sección "# REGLA DE VALORACIÓN INICIAL"');
}

// 2. el caso id_servicio_sugerido = null
if (sm.includes('Si `id_servicio_sugerido` viene en null')) {
  console.log('  = regla de id_servicio_sugerido null ya presente');
} else {
  if (!sm.includes(VIEJO_MOTIVO)) throw new Error('no encontré el bullet de requiere_valoracion_previa');
  sm = sm.replace(VIEJO_MOTIVO, NUEVO_MOTIVO);
  console.log('  ~ bullet de requiere_valoracion_previa');
}

// 3. los dos errores nuevos
if (sm.includes('leyendo el catálogo. Eso')) {
  console.log('  = errores nuevos ya presentes');
} else {
  if (!sm.includes(VIEJO_ERROR)) throw new Error('no encontré el ancla de ERRORES');
  sm = sm.replace(VIEJO_ERROR, NUEVO_ERROR);
  console.log('  + 2 entradas en "# ERRORES QUE NO DEBES COMETER"');
}

// 4. sube la sección v1 a v2 (agrega `nota_valoracion`)
if (sm.includes('`nota_valoracion`')) {
  console.log('  = nota_valoracion ya presente');
} else if (sm.includes(AVISO_V1)) {
  sm = sm.replace(AVISO_V1, AVISO_V2);
  console.log('  ~ sección actualizada a v2 (nota_valoracion)');
} else {
  throw new Error('la sección existe pero no reconozco el bullet de `aviso`');
}

if (sm === original) {
  console.log('\nNada que cambiar.');
  process.exit(0);
}
console.log(`\nsystemMessage: ${antes} → ${sm.length} caracteres (+${sm.length - antes})`);

if (!APLICAR) {
  console.log('Ensayo. Corré con --apply para escribir.');
  process.exit(0);
}

nodo.parameters.options.systemMessage = sm;

// Los dos googleDriveTrigger de este workflow están DESHABILITADOS, así que guardar() no
// aborta. Si alguien los vuelve a habilitar con la credencial vencida, un PUT apagaría el
// bot —pasó el 2026-08-05— y guardar() lo detecta y falla antes.
const despues = await guardar(ID, wf);
console.log(`✓ guardado. active=${despues.active}  versionId=${despues.versionId}`);
