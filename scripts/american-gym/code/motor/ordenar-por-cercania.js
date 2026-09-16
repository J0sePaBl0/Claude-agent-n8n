// Ordena los espacios libres por cercanía a lo que el cliente pidió y arma el mensaje.
// El contrato es que NUNCA se devuelva vacío ni un "no hay" pelado: un resultado vacío
// es exactamente lo que hace alucinar al modelo.
const TZ = 'America/Costa_Rica';
const MAX_ALTERNATIVAS = 6;
// Reglas que dependen del tipo de cita (valoración/evaluación previa). Apagadas en American
// Gym por decisión del proyecto (2026-09-11). Ver "Calcular slots libres".
const REGLAS_POR_TIPO = false;
const VALORACIONES = ['SRV-001'];

const motor = $input.first().json;
const pedido = $('Interpretar la fecha').first().json;
const loc = $('Localizar cita').first().json;

const aMin = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

// "martes 11 de agosto, 9:00 a. m."
function enEspanol(slot) {
  const d = DateTime.fromISO(slot.fecha, { zone: TZ }).setLocale('es');
  const min = aMin(slot.hora_inicio);
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = min % 60;
  const hora = h12 + (mm ? ':' + String(mm).padStart(2, '0') : ':00') + (h24 < 12 ? ' a. m.' : ' p. m.');
  // En una clase grupal los campos que quedan van EN EL TEXTO, ya redactados. Si se
  // devolvieran sueltos, el modelo tendría que decidir cuándo mencionarlos, y un contrato
  // que depende de eso ya se rompió antes en este demo.
  // Clase vacía: anunciar "quedan 20 de 20" suena a que nadie va. Se dice el cupo y ya.
  const campos = slot.cupo > 1
    ? (slot.cupos_libres >= slot.cupo ? ` (clase grupal, cupo para ${slot.cupo})`
      : ` (quedan ${slot.cupos_libres} de ${slot.cupo} campos)`)
    : '';
  return `${d.toFormat("cccc d 'de' LLLL")}, ${hora}, con ${slot.entrenador}${campos}`;
}

const publico = (s) => ({
  texto: enEspanol(s),
  fecha: s.fecha,
  hora_inicio: s.hora_inicio,
  hora_fin: s.hora_fin,
  id_entrenador: s.id_entrenador,
  entrenador: s.entrenador,
  cupo: s.cupo || 1,
  cupos_libres: s.cupos_libres === undefined ? 1 : s.cupos_libres,
});

// Las horas que pudo haber querido decir: [] sin hora, [h] clara, [h, h+12] ambigua.
const horas = pedido.horas_posibles || (pedido.hora_pretendida ? [pedido.hora_pretendida] : []);
const horaAmbigua = horas.length === 2;

// distancia = |Δ días| x 100
//           + |Δ minutos respecto a la hora más cercana de las pedidas| / 15
//           - 40 si cae en la franja que pidió
//           - 25 si es el mismo día que pidió
function distancia(slot) {
  const dias = Math.abs(DateTime.fromISO(slot.fecha, { zone: TZ })
    .diff(DateTime.fromISO(pedido.desde, { zone: TZ }), 'days').days);
  let d = dias * 100;
  if (horas.length) d += Math.min(...horas.map((h) => Math.abs(slot.minuto_inicio - aMin(h)))) / 15;
  else d += slot.minuto_inicio / 600;                     // a igualdad, lo más temprano
  const esManana = slot.minuto_inicio < 12 * 60;
  if (pedido.franja === 'manana' && esManana) d -= 40;
  if (pedido.franja === 'tarde' && !esManana) d -= 40;
  if (slot.fecha === pedido.desde) d -= 25;
  return d;
}

// Se ordena y se deja UN entrenador por fecha+hora. Si no, un servicio que dan varios
// entrenadores ofrecería "6:00 con Ana" y "6:00 con Luis" como si fueran dos espacios
// distintos. Al cliente le importa la hora, no con quién.
function ordenar(lista) {
  const vistos = new Set();
  return [...lista].sort((a, b) => distancia(a) - distancia(b)).filter((s) => {
    const clave = s.fecha + '|' + s.hora_inicio;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

const enRango = motor.slots_en_rango || [];
const todos = motor.slots || [];

// ¿Está libre exactamente lo que pidió?
let exactos = enRango;
if (horas.length) exactos = enRango.filter((s) => horas.includes(s.hora_inicio));
if (pedido.franja === 'manana') exactos = exactos.filter((s) => s.minuto_inicio < 12 * 60);
if (pedido.franja === 'tarde') exactos = exactos.filter((s) => s.minuto_inicio >= 12 * 60);

const disponible = exactos.length > 0;
const base = disponible ? exactos : (enRango.length ? enRango : todos);
const alternativas = ordenar(base).slice(0, MAX_ALTERNATIVAS).map(publico);

// ---------- mensaje redactado para que el agente lo parafrasee ----------
const nombreDia = (f) => DateTime.fromISO(f, { zone: TZ }).setLocale('es').toFormat("cccc d 'de' LLLL");
// Una clase grupal se anuncia distinto que una cita 1 a 1: "ya está llena" no es lo mismo
// que "está ocupada", y el cliente entiende "campo" y no "espacio".
const esClase = motor.es_clase_grupal === true;
let mensaje;

if (!alternativas.length) {
  mensaje = `No tengo espacios de ${motor.servicio} en las próximas semanas. `
    + 'Coordinemos con el gimnasio para buscarle un espacio.';
} else if (motor.motivo === 'feriado') {
  mensaje = `Ese día es feriado y el gimnasio está cerrado. `
    + `Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'cerrado') {
  mensaje = `Ese día el gimnasio no abre. Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'dia_no_habilitado') {
  const dias = motor.equipo.map((p) => `${p.nombre} atiende ${p.dias.split(';').join(', ')}`).join('; ');
  mensaje = `${motor.servicio} no se agenda ese día: ${dias}. `
    + `Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'dia_lleno') {
  mensaje = `${esClase ? 'Esa clase ya está llena ese día' : 'Ese día ya está lleno'}. Lo más cercano que tengo es `
    + `${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
} else if (disponible && horaAmbigua && exactos.some((s) => s.hora_inicio === horas[0])
  && exactos.some((s) => s.hora_inicio === horas[1])) {
  // Libre tanto de mañana como de tarde: no se elige por el cliente.
  const h12 = (h) => { const m = aMin(h); const hh = Math.floor(m / 60) % 12 || 12;
    return `${hh}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'a. m.' : 'p. m.'}`; };
  mensaje = `Tengo espacio tanto a las ${h12(horas[0])} como a las ${h12(horas[1])}. `
    + '¿Lo prefiere de mañana o de tarde?';
} else if (disponible) {
  mensaje = `${esClase ? 'Sí hay campo' : 'Sí tengo espacio'}: ${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
} else if (horas.length) {
  const mismoDia = alternativas.filter((a) => a.fecha === pedido.desde);
  mensaje = mismoDia.length
    ? `${esClase ? 'Esa clase ya está llena' : 'Esa hora está ocupada'}, pero ${nombreDia(pedido.desde)} me quedan `
      + `${mismoDia.slice(0, 3).map((a) => a.hora_inicio).join(' y ')}.`
    : `${esClase ? 'Esa clase ya está llena' : 'Esa hora está ocupada'} y ese día no me queda nada más. `
      + `Lo más cercano es ${alternativas[0].texto}.`;
} else {
  mensaje = `Para ${motor.servicio} lo más cercano que tengo es `
    + `${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
}

// ---------- aviso de la regla de valoración (solo con REGLAS_POR_TIPO) ----------
// Consultar NO bloquea —informa—, pero tiene que decir la verdad sobre la regla. Si calla,
// el modelo la deduce del catálogo y afirma cosas sobre la PERSONA a partir de una columna
// que habla del SERVICIO (Dulce María, 2026-08-28, exec 27517).
const val = loc.valoracion || { estado: 'ninguna', texto: '' };
const proximas = loc.citas_proximas || [];

let avisoRegla = '';
if (REGLAS_POR_TIPO && !VALORACIONES.includes(motor.id_servicio) && val.estado !== 'realizada'
  && (loc.cliente_existente !== true || motor.requiere_valoracion === true)) {
  // El detalle de la valoración (duración, precio) sale de su fila en Servicios cuando se
  // encienda la regla: nunca escrito acá a mano.
  avisoRegla = val.estado === 'agendada'
    ? `${motor.servicio} va después de su evaluación inicial, que ya tiene agendada para ${val.texto}.`
    : `Antes de ${motor.servicio} el gimnasio pide una evaluación inicial.`;
}

// Cada vez que el cliente va a agendar se le recuerdan las citas que ya tiene.
const recordatorio = proximas.length
  ? `Ya tiene ${proximas.length === 1 ? 'una cita agendada' : `${proximas.length} citas agendadas`}: `
    + `${proximas.map((c) => `${c.servicio}, ${c.texto}`).join('; ')}.`
  : '';

return [{
  json: {
    ok: true,
    accion: 'consultar_disponibilidad',
    interpretacion: motor.interpretacion,
    servicio: motor.servicio,
    id_servicio: motor.id_servicio,
    duracion_min: motor.duracion_min,
    disponible,
    motivo: motor.motivo,
    alternativas,
    mensaje,
    // contexto del cliente: los hechos, para que el modelo no los deduzca
    es_clase_grupal: esClase,
    cliente_existente: loc.cliente_existente === true,
    nombre_registrado: loc.nombre_registrado || '',
    email_registrado: loc.email_registrado === true,
    citas_proximas: proximas,
    aviso: [avisoRegla, recordatorio].filter(Boolean).join(' '),
  },
}];
