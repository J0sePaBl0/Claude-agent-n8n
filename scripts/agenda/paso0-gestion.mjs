// Paso 0 de cancelar/reagendar/confirmar: la columna del token.
//
//   node paso0-gestion.mjs [--apply]
//
// `Citas!S` = token_gestion. Es lo único que viaja en el enlace del correo, así que
// identifica la cita sin exponer ids internos ni permitir adivinar la de otro paciente.
// Se rellenan también las citas que ya existen, para poder mandarle un correo a cualquiera
// en el demo y no solo a las nuevas.
import { batchGet, batchUpdate } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');

// 32 hex ≈ 128 bits. crypto.randomUUID no está garantizado en el sandbox del Code node de
// n8n, así que el motor usa la misma forma con respaldo de Math.random; acá, en Node, sí
// está disponible y se usa el bueno.
const token = () => (globalThis.crypto?.randomUUID?.() ?? '')
  .replace(/-/g, '') || [...Array(4)].map(() => Math.random().toString(36).slice(2, 10)).join('');

const citas = (await batchGet(['Citas!A:S']))['Citas!A:S'];
const encabezados = citas[0];
console.log(`Citas: ${citas.length - 1} filas, ${encabezados.length} columnas`);
console.log('  columna S actual:', JSON.stringify(encabezados[18] ?? '(no existe)'));

const escrituras = [];
if (encabezados[18] !== 'token_gestion') {
  escrituras.push({ range: 'Citas!S1', values: [['token_gestion']] });
  console.log('  → se crea el encabezado token_gestion en S1');
}

let nuevos = 0;
const valores = [];
for (let i = 1; i < citas.length; i++) {
  const f = citas[i];
  if (!String(f[0] || '').trim()) { valores.push(['']); continue; }   // fila vacía
  const actual = String(f[18] || '').trim();
  if (actual) { valores.push([actual]); continue; }
  valores.push([token()]);
  nuevos++;
}
if (nuevos) escrituras.push({ range: `Citas!S2:S${citas.length}`, values: valores });

console.log(`  → tokens nuevos a generar: ${nuevos}`);
console.log(`  → citas que ya tenían token: ${citas.length - 1 - nuevos}`);

if (!escrituras.length) { console.log('\nnada que hacer'); process.exit(0); }
if (!APPLY) { console.log('\n(dry run — corré con --apply)'); process.exit(0); }

await batchUpdate(escrituras);

const check = (await batchGet(['Citas!A:S']))['Citas!A:S'];
const sinToken = check.slice(1).filter((f) => String(f[0] || '').trim() && !String(f[18] || '').trim());
const unicos = new Set(check.slice(1).map((f) => f[18]).filter(Boolean));
console.log(`\nencabezado S1: ${JSON.stringify(check[0][18])}`);
console.log(`citas sin token: ${sinToken.length}`);
console.log(`tokens únicos: ${unicos.size}`);
console.log('ejemplo:', check[1][0], '→', check[1][18]);
