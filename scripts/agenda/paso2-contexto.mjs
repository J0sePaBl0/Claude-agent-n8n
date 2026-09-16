// Paso 2 — contexto del paciente en la salida del motor.
//
// Qué arregla (2026-08-28, exec 27517 del agente): a "¿podría agendar una limpieza sin
// antes una valoración?" el bot contestó "no requiere valoración previa" leyendo la
// columna `requiere_valoracion` de `catalogo_servicios`, que habla del SERVICIO y no del
// PACIENTE. `consultar_disponibilidad` ni siquiera evalúa la regla, así que le habría
// contestado igual a un paciente nuevo —al que `agendar` después rebota—. El motor sabía
// la respuesta y se la callaba.
//
// Qué cambia:
//   · `Localizar cita`      → devuelve el contexto del paciente también en consultar/agendar
//                             (`paciente_existente`, `valoracion`, `citas_proximas`).
//   · `Validar reglas`      → la regla del servicio ahora SÍ se levanta con una valoración
//                             ya atendida (antes 21 de 35 servicios eran inagendables de
//                             por vida), y distingue "ya la tiene agendada" de "ya la hizo".
//   · `Ordenar por cercanía`→ emite `aviso` redactado cuando la regla cambia lo que se
//                             puede hacer, y recuerda las citas que el paciente ya tiene.
//   · `Respuesta agendada`  → recuerda las citas previas al confirmar la nueva.
//   · `Respuesta`           → el whitelist deja pasar los campos nuevos.
//
// Idempotente: reemplaza el jsCode de esos 5 nodos por el de code/*.js. No toca nodos,
// conexiones ni settings.
//
//   node paso2-contexto.mjs            muestra el diff y no escribe
//   node paso2-contexto.mjs --apply    aplica con guardar()
import { readFileSync } from 'node:fs';
import { n8n, guardar } from './sheets.mjs';

const ID = 'LsbRqfF2c32hVahw';
const APLICAR = process.argv.includes('--apply');

const src = (f) => readFileSync(`code/${f}`, 'utf8');

// filas.js trae varios bloques separados por "// --- nombre ---".
const bloques = Object.fromEntries(
  src('filas.js').split(/^\/\/ --- (.+?) ---$/m).slice(1)
    .reduce((acc, x, i, a) => (i % 2 ? acc : [...acc, [x, a[i + 1].trim()]]), []),
);

const NUEVO = {
  'Localizar cita': src('localizar-cita.js'),
  'Validar reglas': src('validar-reglas.js'),
  'Ordenar por cercanía': src('ordenar-cercania.js'),
  'Respuesta agendada': bloques['respuesta-agendada'],
  Respuesta: bloques.respuesta,
};

// Un error de sintaxis en un Code node no se ve hasta que un paciente lo dispara. El
// cuerpo lleva `return` en el nivel superior, así que se valida como cuerpo de función.
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

const wf = await n8n(`/workflows/${ID}`);
let cambiados = 0;

for (const nodo of wf.nodes) {
  const codigo = NUEVO[nodo.name];
  if (!codigo) continue;
  if (nodo.type !== 'n8n-nodes-base.code') {
    throw new Error(`"${nodo.name}" no es un Code node, es ${nodo.type}`);
  }
  const antes = String(nodo.parameters.jsCode || '');
  if (antes.trim() === codigo.trim()) {
    console.log(`  = ${nodo.name}  (sin cambios)`);
    continue;
  }
  console.log(`  ~ ${nodo.name}  ${antes.length} → ${codigo.length} caracteres`);
  nodo.parameters.jsCode = codigo;
  cambiados += 1;
}

const faltan = Object.keys(NUEVO).filter((n) => !wf.nodes.some((x) => x.name === n));
if (faltan.length) throw new Error(`no encontré estos nodos en la instancia: ${faltan.join(', ')}`);

console.log(`\n${cambiados} nodo(s) por actualizar.`);
if (!cambiados) process.exit(0);

if (!APLICAR) {
  console.log('Ensayo. Corré con --apply para escribir.');
  process.exit(0);
}

// guardar() aborta si algún trigger habilitado tiene credencial (un PUT lo desactivaría)
// y verifica que el workflow siga activo después. Este motor solo tiene el
// executeWorkflowTrigger y el webhook de prueba, ninguno con credencial.
const despues = await guardar(ID, wf);
console.log(`\n✓ guardado. active=${despues.active}  versionId=${despues.versionId}`);
