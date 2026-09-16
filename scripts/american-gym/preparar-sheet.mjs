// Convierte la copia del CRM de Dulce María en el CRM de American Gym: renombra pestañas y
// encabezados, borra las columnas que el gimnasio no usa y vacía todos los datos de la
// clínica. NO carga el catálogo del gimnasio: eso va en otro paso, cuando llegue la info.
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/preparar-sheet.mjs [--apply]
//
// Sin --apply solo muestra lo que haría. Es idempotente: si una pestaña o columna ya tiene el
// nombre nuevo, la salta.
import { SID, tabs, batchGet, batchUpdate, structure, call } from '../agenda/sheets.mjs';
import { compactar } from './compactar-sheet.mjs';

// Candado: este script destruye datos. Solo puede correr contra la copia del gimnasio.
const SID_GYM = '1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY';
if (SID !== SID_GYM) {
  throw new Error(`Abortado: SID=${SID} no es el Sheet de American Gym. Corré con TENANT=american-gym.`);
}
const APLICAR = process.argv.includes('--apply');

const PESTAÑAS = {
  Pacientes: 'Clientes',
  Profesionales: 'Entrenadores',
  Tratamientos: 'Membresías',
};

// Encabezados que cambian, por pestaña (con el nombre NUEVO de la pestaña).
const COLUMNAS_COMUNES = { id_paciente: 'id_cliente', id_tratamiento: 'id_membresia', id_profesional: 'id_entrenador' };
const COLUMNAS = {
  Clientes: { profesional_asignado: 'entrenador_asignado', alertas_medicas: 'condiciones_salud' },
  'Lista de espera': { profesional_preferido: 'entrenador_preferido' },
  Citas: { confirmada_por_paciente: 'confirmada_por_cliente' },
  Membresías: { notas_clinicas: 'notas' },
  Servicios: { profesionales_habilitados: 'entrenadores_habilitados' },
  Config: { estado_paciente: 'estado_cliente', estado_tratamiento: 'estado_membresia' },
};

// Columnas que el gimnasio no usa. Se borran de verdad (deleteDimension), no se vacían:
// la hoja se va a mostrar. Es seguro porque "Preparar datos" arma los objetos por
// encabezado, no por posición.
const BORRAR_COLUMNAS = { Servicios: ['requiere_valoracion', 'prima', 'mensualidad'] };

// Pestañas cuyas filas de datos son de la clínica y se vacían enteras. Feriados se deja: son
// los feriados nacionales de Costa Rica y se revisan cuando llegue la info del gimnasio.
const VACIAR = ['Clientes', 'Actividades', 'Lista de espera', 'Pagos y cobros', 'Citas',
  'Membresías', 'Entrenadores', 'Servicios', 'Oportunidades', 'Interacciones'];
// Config: solo la fila de la sede. Los enums (L en adelante) se reescriben con los valores
// del gimnasio más adelante; escribir más ancho que A2:I2 los borraría.
const VACIAR_RANGOS = ['Config!A2:I2'];

const plan = [];
const log = (s) => { plan.push(s); console.log(s); };

// ---------- 1. pestañas ----------
let props = await tabs();
const porTitulo = Object.fromEntries(props.map((p) => [p.title, p]));
const renombrarPestañas = Object.entries(PESTAÑAS)
  .filter(([viejo, nuevo]) => porTitulo[viejo] && !porTitulo[nuevo])
  .map(([viejo, nuevo]) => {
    log(`pestaña: ${viejo} → ${nuevo}`);
    return { updateSheetProperties: { properties: { sheetId: porTitulo[viejo].sheetId, title: nuevo }, fields: 'title' } };
  });
if (APLICAR && renombrarPestañas.length) {
  await structure(renombrarPestañas);
  props = await tabs();
}
// En modo simulación las pestañas todavía tienen el nombre viejo: se resuelve por los dos.
const titulo = (nuevo) => {
  const viejo = Object.keys(PESTAÑAS).find((k) => PESTAÑAS[k] === nuevo);
  return props.some((p) => p.title === nuevo) ? nuevo : (viejo || nuevo);
};
const idDe = (t) => props.find((p) => p.title === titulo(t)).sheetId;

// ---------- 2. encabezados ----------
const nombresActuales = props.map((p) => p.title);
const cabeceras = await batchGet(nombresActuales.map((t) => `'${t}'!1:1`));
const escrituras = [];
for (const t of nombresActuales) {
  const nuevoTitulo = PESTAÑAS[t] || t;
  const fila = cabeceras[`'${t}'!1:1`][0] || [];
  const mapa = { ...COLUMNAS_COMUNES, ...(COLUMNAS[nuevoTitulo] || {}) };
  const nueva = fila.map((h) => mapa[h] || h);
  if (nueva.some((h, i) => h !== fila[i])) {
    fila.forEach((h, i) => { if (nueva[i] !== h) log(`  ${nuevoTitulo}: ${h} → ${nueva[i]}`); });
    escrituras.push({ range: `'${titulo(nuevoTitulo)}'!A1`, values: [nueva] });
  }
}
if (APLICAR && escrituras.length) await batchUpdate(escrituras);

// ---------- 3. columnas a borrar ----------
const borrados = [];
for (const [t, cols] of Object.entries(BORRAR_COLUMNAS)) {
  const fila = (await batchGet([`'${titulo(t)}'!1:1`]))[`'${titulo(t)}'!1:1`][0] || [];
  // De derecha a izquierda, para que borrar una no corra el índice de las siguientes.
  const indices = cols.map((c) => fila.indexOf(c)).filter((i) => i >= 0).sort((a, b) => b - a);
  for (const i of indices) {
    log(`  ${t}: borrar columna ${fila[i]}`);
    borrados.push({ deleteDimension: { range: { sheetId: idDe(t), dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 } } });
  }
}
if (APLICAR && borrados.length) await structure(borrados);

// ---------- 4. vaciar datos ----------
const rangos = [...VACIAR.map((t) => `'${titulo(t)}'!A2:ZZ`), ...VACIAR_RANGOS];
log(`vaciar: ${rangos.join(', ')}`);
if (APLICAR) {
  await call({
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchClear`,
    payload: { ranges: rangos },
  });
  // batchClear borra los valores pero NO las filas, y Google las sigue contando como parte de
  // la tabla: el `append` del nodo de Google Sheets aterriza debajo de ellas y los registros
  // nuevos aparecen al final de la hoja en vez de justo bajo el encabezado. Hay que borrar las
  // filas de verdad. Ver compactar-sheet.mjs.
  await compactar({ aplicar: true });
}

console.log(APLICAR ? '\n✅ aplicado' : '\n(simulación — agregá --apply para escribir)');
