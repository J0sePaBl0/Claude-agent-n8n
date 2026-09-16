// El agente ya no usa Structured Output Parser: devuelve texto crudo y acá se valida.
// Motivo: un parser que lanza excepción tumba el turno completo y termina mandándole
// un mensaje vacío al cliente. Este nodo NUNCA falla.
//
// REGLA DE ORO: un problema de FORMATO no es motivo para escalar a una persona.
// Si el modelo escribió algo legible para el cliente, se le entrega ESO (rescate).
// Solo se escala de verdad cuando el modelo falló, cuando él mismo lo pidió, o cuando
// no hay absolutamente ningún texto que enviarle al cliente.

const MOTIVOS = ['ninguno', 'solicitud_cliente', 'informacion_no_disponible', 'tema_salud_sensible', 'frustracion'];

const entrada = $input.first().json;

const crudaTexto = typeof entrada.output === 'string'
  ? entrada.output
  : JSON.stringify(entrada.output ?? null);

// Saca el valor de "respuesta" de un JSON roto, sin parsearlo.
function extraerRespuestaSuelta(texto) {
  const m = String(texto).match(/"respuesta"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return '';
  try {
    return JSON.parse('"' + m[1] + '"').trim();
  } catch (e) {
    return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  }
}

// Escalamiento real: no hay nada que responderle al cliente.
const fallback = (detalle) => [{
  json: {
    output: {
      respuesta: 'Permítame un momento, le comunico con una persona de nuestro equipo.',
      escalar: true,
      motivo_escalamiento: 'informacion_no_disponible',
      detalle_escalamiento: detalle,
    },
    parse_ok: false,
    rescatado: false,
    motivo_fallo: detalle,
    salida_cruda: String(crudaTexto).slice(0, 500),
  },
  pairedItem: { item: 0 },
}];

// Rescate: el modelo no respetó el formato, pero sí escribió una respuesta usable.
// Se le entrega al cliente en vez de escalarlo por un problema de formato.
const rescate = (texto, motivo_fallo) => [{
  json: {
    output: {
      respuesta: String(texto).trim(),
      escalar: false,
      motivo_escalamiento: 'ninguno',
      detalle_escalamiento: '',
    },
    parse_ok: false,
    rescatado: true,
    motivo_fallo,
    salida_cruda: String(crudaTexto).slice(0, 500),
  },
  pairedItem: { item: 0 },
}];

// El agente tiene onError: continueRegularOutput, así que un fallo del modelo llega como {error}.
if (entrada.error) {
  return fallback(`El modelo falló: ${entrada.error}`);
}

// La salida puede venir como string (lo normal sin parser) o como objeto ya estructurado.
let datos = entrada.output;

if (typeof datos === 'string') {
  let texto = datos.trim();
  // Quita bloques de código: ```json ... ```
  texto = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  const ini = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  // Un JSON truncado (se cortó por max tokens) no tiene "}" pero tampoco es prosa:
  // mandárselo crudo al cliente sería peor que escalar.
  const intentoJson = texto.startsWith('{') || /"respuesta"\s*:/.test(texto);

  if (ini === -1 || fin <= ini) {
    if (intentoJson) {
      const suelta = extraerRespuestaSuelta(texto);
      if (suelta) return rescate(suelta, 'JSON truncado o sin cerrar; se rescató "respuesta".');
      return fallback('El modelo devolvió un JSON truncado e ilegible.');
    }
    // Prosa limpia: es la respuesta del modelo, solo que sin la envoltura JSON.
    if (texto) return rescate(texto, 'El modelo respondió en texto plano, sin JSON.');
    return fallback('El modelo devolvió una salida vacía.');
  }

  const bloque = texto.slice(ini, fin + 1);
  try {
    datos = JSON.parse(bloque);
  } catch (e) {
    const motivo = `JSON inválido del modelo: ${e.message}`;
    const suelta = extraerRespuestaSuelta(bloque);
    if (suelta) return rescate(suelta, motivo);
    // JSON roto y sin campo rescatable: si había prosa fuera del bloque, se usa esa.
    const prosa = (texto.slice(0, ini) + ' ' + texto.slice(fin + 1)).trim();
    if (prosa) return rescate(prosa, motivo);
    return fallback(motivo);
  }
}

if (!datos || typeof datos !== 'object') {
  const suelta = String(crudaTexto).trim();
  if (suelta) return rescate(suelta, 'La salida del modelo no era un objeto.');
  return fallback('La salida del modelo no era un objeto.');
}

// Contaminación conocida del historial: n8n guarda la respuesta anidada bajo "output" en la
// memoria de chat, y el modelo imita esa envoltura en turnos siguientes. En vez de fallar
// por eso (la causa histórica de "Model output doesn't fit required format"), se desenvuelve.
let capas = 0;
while (datos && typeof datos === 'object' && !('respuesta' in datos) && datos.output && capas < 5) {
  datos = datos.output;
  capas += 1;
}

const respuesta = typeof datos.respuesta === 'string' ? datos.respuesta.trim() : '';
if (!respuesta) {
  const suelta = extraerRespuestaSuelta(crudaTexto);
  if (suelta) return rescate(suelta, 'El JSON no traía "respuesta" en la raíz.');
  return fallback('El modelo no devolvió el campo "respuesta".');
}

const escalar = datos.escalar === true || String(datos.escalar).trim().toLowerCase() === 'true';
const motivo = MOTIVOS.includes(datos.motivo_escalamiento)
  ? datos.motivo_escalamiento
  : (escalar ? 'informacion_no_disponible' : 'ninguno');
const detalle = typeof datos.detalle_escalamiento === 'string' ? datos.detalle_escalamiento : '';

return [{
  json: {
    output: {
      respuesta,
      escalar,
      motivo_escalamiento: motivo,
      detalle_escalamiento: escalar ? (detalle || respuesta.slice(0, 140)) : '',
    },
    parse_ok: true,
    rescatado: false,
    capas_desenvueltas: capas,
  },
  pairedItem: { item: 0 },
}];
