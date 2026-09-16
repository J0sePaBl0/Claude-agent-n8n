// Borra las filas vacías que quedaron entre el encabezado y los datos de cada pestaña.
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/compactar-sheet.mjs [--apply]
//
// Por qué existe: `preparar-sheet.mjs` vaciaba los datos de la clínica con `values:batchClear`,
// que borra los VALORES pero deja las filas. Google Sheets sigue contando esas filas como parte
// de la tabla, así que todo lo que se escribe después (el `append` del nodo de Google Sheets y
// el sembrado de los datos del gimnasio) aterriza DEBAJO de ellas: la tabla arranca en la fila
// 25 en vez de la 2 y cada registro nuevo aparece al final de la hoja. Esto las borra de verdad
// (`deleteDimension`), que es lo único que devuelve el `append` al principio.
//
// Solo toca filas COMPLETAMENTE vacías (en todas las columnas) que estén por encima de la
// última fila con datos. Nunca borra el encabezado ni deja huecos entre los datos.
import { SID, tabs, batchGet, structure } from '../agenda/sheets.mjs';

const SID_GYM = '1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY';
if (SID !== SID_GYM) {
  throw new Error(`Abortado: SID=${SID} no es el Sheet de American Gym. Corré con TENANT=american-gym.`);
}

/** Agrupa índices consecutivos: [2,3,4,9,10] → [[2,4],[9,10]] (inclusive, base 1). */
function tramos(filas) {
  const out = [];
  for (const f of filas) {
    const ultimo = out[out.length - 1];
    if (ultimo && f === ultimo[1] + 1) ultimo[1] = f;
    else out.push([f, f]);
  }
  return out;
}

export async function compactar({ aplicar = false } = {}) {
  const props = await tabs();
  const rangos = props.map((p) => `'${p.title}'!A:ZZ`);
  const datos = await batchGet(rangos);

  const peticiones = [];
  for (const p of props) {
    const filas = datos[`'${p.title}'!A:ZZ`] || [];
    const llena = (f) => (f || []).some((c) => String(c ?? '').trim() !== '');
    // Última fila con datos: por debajo de ella no hay nada que compactar.
    let ultima = 0;
    filas.forEach((f, i) => { if (llena(f)) ultima = i + 1; });
    const vacias = [];
    for (let n = 2; n <= ultima; n++) if (!llena(filas[n - 1])) vacias.push(n);
    if (!vacias.length) continue;

    console.log(`${p.title}: borrar ${vacias.length} filas vacías `
      + `(${tramos(vacias).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')})`);
    // De abajo hacia arriba, para que borrar un tramo no corra el índice de los de arriba.
    for (const [a, b] of tramos(vacias).reverse()) {
      peticiones.push({ deleteDimension: {
        range: { sheetId: p.sheetId, dimension: 'ROWS', startIndex: a - 1, endIndex: b },
      } });
    }
  }

  if (!peticiones.length) { console.log('No hay filas vacías que borrar.'); return 0; }
  if (aplicar) await structure(peticiones);
  return peticiones.length;
}

// Solo corre como CLI; preparar-sheet.mjs lo importa y llama a compactar() directo.
if (process.argv[1].endsWith('compactar-sheet.mjs')) {
  const aplicar = process.argv.includes('--apply');
  const n = await compactar({ aplicar });
  if (n) console.log(aplicar ? '\n✅ aplicado' : '\n(simulación — agregá --apply para escribir)');
}
