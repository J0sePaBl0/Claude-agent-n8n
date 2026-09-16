// Normaliza CUALQUIER rama de extracción a UN documento markdown limpio.
//
// Por qué existe: el Default Data Loader estaba en modo "allInputData", así que
// LangChain vectorizaba cada valor string del JSON de entrada — incluida la
// metadata del PDF (Author, Producer, CreationDate, version...). De 8 PDFs salían
// 166 vectores, la mayoría basura tipo "1.4" o "ReportLab PDF Library".
//
// Contrato de salida: exactamente 1 item con { contenido, titulo, nombre_archivo,
// file_id, clinic_id, formato, actualizado, caracteres }.

const meta = $('Edit Fields').first().json;
const nombreArchivo = meta.nombre_archivo || 'sin_nombre';
const items = $input.all();

// --- título y formato a partir del nombre de archivo -------------------------
const tituloDeArchivo = nombreArchivo
  .replace(/\.[^.]+$/, '')
  .replace(/^\d+[_-]\s*/, '')
  .replace(/[_-]+/g, ' ')
  .trim();

const extension = (nombreArchivo.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
const FORMATO_POR_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.google-apps.document': 'gdoc',
  'application/vnd.google-apps.spreadsheet': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/plain': 'txt',
};
const formato = FORMATO_POR_MIME[meta.tipo_documento] || extension || 'texto';

// --- 1. texto crudo según la rama que llegó ---------------------------------
function filasATablaMarkdown(filas) {
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  if (!columnas.length) return '';
  const celda = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
  return [
    '| ' + columnas.map(celda).join(' | ') + ' |',
    '| ' + columnas.map(() => '---').join(' | ') + ' |',
    ...filas.map((f) => '| ' + columnas.map((c) => celda(f[c])).join(' | ') + ' |'),
  ].join('\n');
}

const primero = items[0] ? items[0].json : {};
let crudo = '';
let esTabla = false;

if (typeof primero.text === 'string') {
  crudo = items.map((i) => i.json.text || '').join('\n\n');              // PDF
} else if (typeof primero.data === 'string') {
  crudo = items.map((i) => i.json.data || '').join('\n\n');              // DOC / MD / texto plano
} else if (typeof primero.concatenated_data === 'string') {
  crudo = primero.concatenated_data;                                     // Summarize (legado)
} else {
  crudo = filasATablaMarkdown(items.map((i) => i.json));                 // CSV / XLSX
  esTabla = true;
}

// --- 2. limpieza -------------------------------------------------------------
let texto = String(crudo).replace(/\r\n/g, '\n').replace(/ /g, ' ');
const yaEstructurado = esTabla || /^#{1,6}\s/m.test(texto);

if (!yaEstructurado) {
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !/^(p[áa]gina|page)\s*\d+\s*$/i.test(l))
    .filter((l) => !/^\d+\s*$/.test(l));

  // Re-unir párrafos partidos por el ancho de línea del PDF: si una línea no cierra
  // con puntuación y la siguiente arranca en minúscula, son la misma oración.
  const unidas = [];
  for (const linea of lineas) {
    const previa = unidas[unidas.length - 1];
    const continuacion =
      previa &&
      previa !== '' &&
      linea !== '' &&
      !/[.:;!?]$/.test(previa) &&
      !/^[-*•>|]/.test(linea) &&
      !/^\d+[.)]\s/.test(linea) &&
      /^[a-záéíóúüñ(]/.test(linea);
    if (continuacion) unidas[unidas.length - 1] = previa + ' ' + linea;
    else unidas.push(linea);
  }

  // Promover a "## " las líneas cortas sin puntuación final seguidas de un párrafo.
  texto = unidas
    .map((linea, i) => {
      if (!linea || linea.startsWith('#')) return linea;
      const siguiente = unidas[i + 1] || '';
      const esCorta = linea.length < 80;
      const sinCierre = !/[.;!?,:]$/.test(linea);
      // Un encabezado va seguido de prosa: basta con que la línea siguiente sea
      // una oración de verdad (empieza en mayúscula y tiene cuerpo), no otro fragmento.
      const siguienteEsParrafo = siguiente.length > 40 && /^[A-ZÁÉÍÓÚÑ¿¡"«(]/.test(siguiente);
      return esCorta && sinCierre && siguienteEsParrafo ? '## ' + linea : linea;
    })
    .join('\n');
}

// --- 3. título H1 ------------------------------------------------------------
let titulo = tituloDeArchivo;
const h1 = texto.match(/^#\s+(.+)$/m);

if (h1) {
  titulo = h1[1].trim();
} else {
  const lineas = texto.split('\n');
  const idx = lineas.findIndex((l) => l.trim() !== '');
  const primera = idx >= 0 ? lineas[idx].trim() : '';
  const pareceTitulo =
    !esTabla && primera.length > 0 && primera.length < 100 &&
    !/[.;!?]$/.test(primera) && !primera.startsWith('|') && !primera.startsWith('##');
  if (pareceTitulo) {
    titulo = primera.replace(/^#+\s*/, '');
    lineas[idx] = '# ' + titulo;
    texto = lineas.join('\n');
  } else {
    texto = '# ' + tituloDeArchivo + '\n\n' + texto;
  }
}

// --- 4. prolijidad final -----------------------------------------------------
texto = texto
  .replace(/\n(#{1,6}\s)/g, '\n\n$1')   // línea en blanco antes de cada encabezado
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// --- 5. guarda ---------------------------------------------------------------
// Falla ruidosamente ANTES del borrado de vectores (que corre aguas abajo), así
// un archivo ilegible nunca deja el documento fuera de la base sin aviso.
if (texto.replace(/[#\s]/g, '').length < 20) {
  throw new Error(
    'La normalización de "' + nombreArchivo + '" (file_id ' + meta.file_id + ') quedó vacía. ' +
    'No se borró ni insertó nada. Revisar si el archivo tiene texto extraíble.'
  );
}

return [{
  json: {
    contenido: texto,
    titulo,
    nombre_archivo: nombreArchivo,
    file_id: meta.file_id,
    clinic_id: meta.clinic_id,
    formato,
    actualizado: meta.actualizado,
    caracteres: texto.length,
  },
}];