// Convierte la respuesta cruda de values:batchGet en tablas de objetos.
//
// Por qué una sola llamada y no un nodo de Sheets por tab: la API de Google permite
// 60 lecturas por minuto por usuario, y cada nodo de Sheets gasta ~2. Con 5 nodos por
// consulta, dos pacientes conversando a la vez tumbaban la herramienta con un 429.
// Un batchGet de 8 rangos gasta 1.
const ORDEN = ['servicios', 'profesionales', 'citas', 'feriados', 'config', 'pacientes', 'oportunidades', 'actividades'];

const cruda = $input.first().json;
const rangos = cruda.valueRanges || [];

function aObjetos(valores) {
  if (!valores || valores.length < 2) return [];
  const cabeceras = valores[0].map((h) => String(h || '').trim());
  return valores.slice(1)
    .map((fila, i) => {
      const o = { row_number: i + 2 };
      cabeceras.forEach((h, c) => { if (h) o[h] = fila[c] === undefined ? '' : fila[c]; });
      return o;
    })
    .filter((o) => Object.keys(o).length > 1 && Object.entries(o).some(([k, v]) => k !== 'row_number' && String(v).trim()));
}

const tablas = {};
ORDEN.forEach((nombre, i) => { tablas[nombre] = aObjetos((rangos[i] || {}).values); });

return [{
  json: {
    ...tablas,
    conteos: Object.fromEntries(ORDEN.map((n) => [n, tablas[n].length])),
  },
}];
