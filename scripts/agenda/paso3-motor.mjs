// Paso 3b — el motor avisa por correo.
//
// Agrega UN nodo `Enviar correo de la cita` (executeWorkflow → "Clínica — Correos de
// citas") intercalado entre las dos ramas que terminan una gestión y el nodo `Respuesta`:
//
//   Respuesta agendada ─┐
//                       ├→ Enviar correo de la cita → Respuesta
//   Respuesta gestión ──┘
//
// Va INTERCALADO y no en paralelo porque el sub-workflow devuelve el dato del último nodo
// que ejecuta, y `Respuesta` tiene que ser ese. Con `waitForSubWorkflow: false` el nodo
// devuelve su ENTRADA sin tocarla (verificado en la instancia), así que `Respuesta` sigue
// recibiendo exactamente lo que le llegaba antes, y el paciente no espera a Gmail.
//
// Idempotente.
//
//   node paso3-motor.mjs            ensayo
//   node paso3-motor.mjs --apply    aplica con guardar()
import { readFileSync } from 'node:fs';
import { n8n, guardar } from './sheets.mjs';

const ID = 'LsbRqfF2c32hVahw';
const WF_CORREOS = 'JMZoI1W9QC16LdVK';
const NODO = 'Enviar correo de la cita';
const APLICAR = process.argv.includes('--apply');

const src = (f) => readFileSync(`code/${f}`, 'utf8');
const bloques = Object.fromEntries(
  src('filas.js').split(/^\/\/ --- (.+?) ---$/m).slice(1)
    .reduce((acc, x, i, a) => (i % 2 ? acc : [...acc, [x, a[i + 1].trim()]]), []),
);

const NUEVO = {
  'Confirmar y preparar': src('confirmar-preparar.js'),
  'Preparar gestión': src('gestion.js'),
  'Respuesta gestión': src('respuesta-gestion.js'),
  'Fila paciente': bloques['fila-paciente'],
  'Respuesta agendada': bloques['respuesta-agendada'],
};

for (const [nombre, codigo] of Object.entries(NUEVO)) {
  if (!codigo || !codigo.trim()) throw new Error(`bloque vacío para "${nombre}"`);
  try {
    // eslint-disable-next-line no-new-func
    new Function('$', '$input', 'DateTime', codigo);
  } catch (e) {
    throw new Error(`sintaxis inválida en "${nombre}": ${e.message}`);
  }
}
console.log('✓ los 5 bloques compilan\n');

const CAMPOS = ['tipo', 'email', 'nombre_paciente', 'servicio', 'texto_cita', 'profesional',
  'id_cita', 'nota', 'texto_anterior', 'sede_nombre', 'sede_direccion', 'sede_link_maps',
  'sede_telefono', 'sede_whatsapp'];

const nodoCorreo = {
  id: 'motor-correo-cita',
  name: NODO,
  type: 'n8n-nodes-base.executeWorkflow',
  typeVersion: 1.2,
  position: [4520, 200],
  // El correo es un aviso: la cita ya quedó escrita en el Sheet antes de llegar acá.
  // Si Gmail falla, el paciente tiene que recibir su respuesta en WhatsApp igual.
  onError: 'continueRegularOutput',
  parameters: {
    workflowId: {
      __rl: true,
      value: WF_CORREOS,
      mode: 'list',
      cachedResultName: 'Clínica — Correos de citas',
      cachedResultUrl: `/workflow/${WF_CORREOS}`,
    },
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: Object.fromEntries(CAMPOS.map((c) => [c, `={{ $json.correo?.${c} ?? '' }}`])),
      matchingColumns: [],
      schema: CAMPOS.map((c) => ({
        id: c, displayName: c, required: false, defaultMatch: false,
        display: true, canBeUsedToMatch: true, type: 'string', removed: false,
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: true,
    },
    options: { waitForSubWorkflow: false },
  },
};

const wf = await n8n(`/workflows/${ID}`);
let cambios = 0;

// ---------- 1. el jsCode de los 5 nodos ----------
for (const nodo of wf.nodes) {
  const codigo = NUEVO[nodo.name];
  if (!codigo) continue;
  if (String(nodo.parameters.jsCode || '').trim() === codigo.trim()) {
    console.log(`  = ${nodo.name}`);
    continue;
  }
  console.log(`  ~ ${nodo.name}  ${String(nodo.parameters.jsCode || '').length} → ${codigo.length}`);
  nodo.parameters.jsCode = codigo;
  cambios += 1;
}
const faltan = Object.keys(NUEVO).filter((n) => !wf.nodes.some((x) => x.name === n));
if (faltan.length) throw new Error(`no encontré: ${faltan.join(', ')}`);

// ---------- 2. el nodo del correo ----------
const yaEsta = wf.nodes.find((n) => n.name === NODO);
if (yaEsta) {
  Object.assign(yaEsta, nodoCorreo);
  console.log(`  = ${NODO} (actualizado en sitio)`);
} else {
  wf.nodes.push(nodoCorreo);
  console.log(`  + ${NODO}`);
  cambios += 1;
}

// ---------- 3. el cableado ----------
// Se tocan SOLO las salidas que cambian. Borrar `main` completo de un nodo perdió las
// ramas de error hacia `Respuesta` en el paso 1 y el webhook empezó a contestar
// "No item to return was found".
const C = wf.connections;
for (const origen of ['Respuesta agendada', 'Respuesta gestión']) {
  C[origen] = C[origen] || { main: [[]] };
  const salida = C[origen].main[0] || [];
  const yaVaAlCorreo = salida.some((x) => x.node === NODO);
  if (yaVaAlCorreo && salida.length === 1) { console.log(`  = ${origen} → ${NODO}`); continue; }
  C[origen].main[0] = [{ node: NODO, type: 'main', index: 0 }];
  console.log(`  ~ ${origen} → ${NODO}  (antes iba a ${salida.map((x) => x.node).join(', ') || 'nada'})`);
  cambios += 1;
}
if (!C[NODO] || !(C[NODO].main?.[0] || []).some((x) => x.node === 'Respuesta')) {
  C[NODO] = { main: [[{ node: 'Respuesta', type: 'main', index: 0 }]] };
  console.log(`  ~ ${NODO} → Respuesta`);
  cambios += 1;
}

// Red de seguridad: nadie puede quedar sin camino a "Respuesta".
const destinos = new Set(Object.values(C).flatMap((v) => (v.main || []).flat().map((x) => x.node)));
if (!destinos.has('Respuesta')) throw new Error('quedó nadie apuntando a "Respuesta"');

console.log(`\n${cambios} cambio(s).`);
if (!cambios) process.exit(0);
if (!APLICAR) { console.log('Ensayo. Corré con --apply para escribir.'); process.exit(0); }

const despues = await guardar(ID, wf);
console.log(`✓ guardado. active=${despues.active}  versionId=${despues.versionId}`);
