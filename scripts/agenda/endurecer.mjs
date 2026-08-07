// Endurece el motor de agenda ANTES de agregarle cancelar/reagendar/confirmar.
//
//   node endurecer.mjs [--apply]
//
// Tres cosas, todas para que las funcionalidades nuevas no tumben lo que ya funciona:
//
//  1. REINTENTOS en los nodos que llaman a Google. Hoy no hay ninguno y todos son
//     onError:stop: un solo 429 de cuota mata la llamada y el agente se queda sin
//     respuesta, que es justo la condición que lo hace alucinar. Google Sheets permite
//     60 lecturas por minuto por usuario y cada llamada a una tool gasta ~2. Pasar de
//     2 tools a 5 multiplica esa presión.
//
//  2. onError EN LAS TOOLS del agente. `consultar_disponibilidad` y `agendar_cita` están
//     en onError:stop, a diferencia de `catalogo_servicios`. Si el motor falla, revienta
//     la ejecución entera del agente en vez de que el modelo reciba el error y escale.
//
//  3. El CALLEJÓN SIN SALIDA de la valoración previa: devolvía `alternativas: []` y un
//     mensaje escrito para el modelo. Ahora devuelve horarios reales de valoración.
import { readFileSync } from 'node:fs';
import { n8n, guardar } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const SUB = 'LsbRqfF2c32hVahw';
const AGENTE = 'GmGt3g3krJCoDli0';

// Política de reintentos, por qué cada una:
//   lectura  → idempotente, se reintenta sin miedo
//   upsert   → idempotente por clave, igual
//   append   → NO se reintenta: un timeout después de que la fila entró duplicaría la cita.
//              Que falle fuerte es preferible a una reserva doble silenciosa.
const REINTENTOS = {
  'Leer todo el CRM':        { maxTries: 3, waitBetweenTries: 2000 },
  'Releer citas frescas':    { maxTries: 3, waitBetweenTries: 2000 },
  'Guardar paciente':        { maxTries: 3, waitBetweenTries: 2000 },
  'Escribir actividad':      { maxTries: 3, waitBetweenTries: 2000 },
  'Actualizar oportunidad':  { maxTries: 3, waitBetweenTries: 2000 },
  'Guardar id del evento':   { maxTries: 3, waitBetweenTries: 2000 },
  'Crear evento en Calendar':{ maxTries: 2, waitBetweenTries: 2000 },
};
const SIN_REINTENTO = ['Escribir cita'];

const CODIGO = {
  'Calcular slots libres': 'code/calcular-slots.js',
  'Validar reglas':        'code/validar-reglas.js',
};

const cambios = [];

// ---------------------------------------------------------------- sub-workflow
const sub = await n8n(`/workflows/${SUB}`);
for (const n of sub.nodes) {
  if (CODIGO[n.name]) {
    const nuevo = readFileSync(CODIGO[n.name], 'utf8');
    if (n.parameters.jsCode !== nuevo) {
      cambios.push(`código · ${n.name}`);
      if (APPLY) n.parameters.jsCode = nuevo;
    }
  }
  if (REINTENTOS[n.name] && !n.retryOnFail) {
    cambios.push(`reintentos · ${n.name} (${REINTENTOS[n.name].maxTries} intentos)`);
    if (APPLY) Object.assign(n, { retryOnFail: true, ...REINTENTOS[n.name] });
  }
  if (SIN_REINTENTO.includes(n.name) && n.retryOnFail) {
    cambios.push(`QUITA reintentos · ${n.name} (append no idempotente)`);
    if (APPLY) Object.assign(n, { retryOnFail: false });
  }
}

// ---------------------------------------------------------------- agente
const ag = await n8n(`/workflows/${AGENTE}`);
for (const n of ag.nodes) {
  if (['consultar_disponibilidad', 'agendar_cita'].includes(n.name) && n.onError !== 'continueRegularOutput') {
    cambios.push(`onError · ${n.name} → continueRegularOutput`);
    if (APPLY) n.onError = 'continueRegularOutput';
  }
  // A propósito NO se le ponen reintentos a las tools: reintentar `agendar_cita` volvería
  // a correr el sub-workflow entero y podría escribir la cita dos veces. Los reintentos
  // van adentro, en los nodos concretos que sí son idempotentes.
}

console.log('Cambios:');
cambios.forEach((c) => console.log('  ·', c));
if (!cambios.length) console.log('  (nada que hacer)');

if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

await guardar(SUB, sub);
console.log('\nsub-workflow guardado');
await guardar(AGENTE, ag);
console.log('agente guardado');

for (const [nombre, id] of [['sub-workflow', SUB], ['agente', AGENTE]]) {
  const v = await n8n(`/workflows/${id}`);
  console.log(`  ${nombre}: activo=${v.active} · publicado=${v.versionId === v.activeVersionId}`);
}
