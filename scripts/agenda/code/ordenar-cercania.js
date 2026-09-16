// Ordena los espacios libres por cercanía a lo que el paciente pidió y arma el mensaje.
// El contrato es que NUNCA se devuelva vacío ni un "no hay" pelado: un resultado vacío
// es exactamente lo que hace alucinar al modelo.
const TZ = 'America/Costa_Rica';
const MAX_ALTERNATIVAS = 6;
const VALORACIONES = ['SRV-001', 'SRV-016'];

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
  return `${d.toFormat("cccc d 'de' LLLL")}, ${hora}, con ${slot.profesional}`;
}

const publico = (s) => ({
  texto: enEspanol(s),
  fecha: s.fecha,
  hora_inicio: s.hora_inicio,
  hora_fin: s.hora_fin,
  id_profesional: s.id_profesional,
  profesional: s.profesional,
});

// distancia = |Δ días| x 100
//           + |Δ minutos respecto a la hora pretendida| / 15
//           - 40 si cae en la franja que pidió
//           - 25 si es el mismo día que pidió
function distancia(slot) {
  const dias = Math.abs(DateTime.fromISO(slot.fecha, { zone: TZ })
    .diff(DateTime.fromISO(pedido.desde, { zone: TZ }), 'days').days);
  let d = dias * 100;
  if (pedido.hora_pretendida) d += Math.abs(slot.minuto_inicio - aMin(pedido.hora_pretendida)) / 15;
  else d += slot.minuto_inicio / 600;                     // a igualdad, lo más temprano
  const esManana = slot.minuto_inicio < 12 * 60;
  if (pedido.franja === 'manana' && esManana) d -= 40;
  if (pedido.franja === 'tarde' && !esManana) d -= 40;
  if (slot.fecha === pedido.desde) d -= 25;
  return d;
}

// Se ordena y se deja UN profesional por fecha+hora. Si no, una valoración —que la hacen
// los cuatro— ofrecería "8:00 con Dulce María" y "8:00 con Andrés" como si fueran dos
// espacios distintos. Al paciente le importa la hora, no con quién.
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
if (pedido.hora_pretendida) exactos = enRango.filter((s) => s.hora_inicio === pedido.hora_pretendida);
if (pedido.franja === 'manana') exactos = exactos.filter((s) => s.minuto_inicio < 12 * 60);
if (pedido.franja === 'tarde') exactos = exactos.filter((s) => s.minuto_inicio >= 12 * 60);

const disponible = exactos.length > 0;
const base = disponible ? exactos : (enRango.length ? enRango : todos);
const alternativas = ordenar(base).slice(0, MAX_ALTERNATIVAS).map(publico);

// ---------- mensaje redactado para que el agente lo parafrasee ----------
const nombreDia = (f) => DateTime.fromISO(f, { zone: TZ }).setLocale('es').toFormat("cccc d 'de' LLLL");
let mensaje;

if (!alternativas.length) {
  mensaje = `No tengo espacios de ${motor.servicio} en las próximas semanas. `
    + 'Coordinemos con la clínica para buscarle un espacio.';
} else if (motor.motivo === 'feriado') {
  mensaje = `Ese día es feriado y la clínica está cerrada. `
    + `Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'domingo') {
  mensaje = `Los domingos la clínica no abre. Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'dia_no_habilitado') {
  const dias = motor.equipo.map((p) => `${p.nombre} atiende ${p.dias.split(';').join(', ')}`).join('; ');
  mensaje = `${motor.servicio} no se agenda ese día: ${dias}. `
    + `Lo más cercano que tengo es ${alternativas[0].texto}.`;
} else if (motor.motivo === 'dia_lleno') {
  mensaje = `Ese día ya está lleno. Lo más cercano que tengo es `
    + `${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
} else if (disponible) {
  mensaje = `Sí tengo espacio: ${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
} else if (pedido.hora_pretendida) {
  const mismoDia = alternativas.filter((a) => a.fecha === pedido.desde);
  mensaje = mismoDia.length
    ? `Esa hora está ocupada, pero ${nombreDia(pedido.desde)} me quedan `
      + `${mismoDia.slice(0, 3).map((a) => a.hora_inicio).join(' y ')}.`
    : `Esa hora está ocupada y ese día no me queda nada más. Lo más cercano es ${alternativas[0].texto}.`;
} else {
  mensaje = `Para ${motor.servicio} lo más cercano que tengo es `
    + `${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`;
}

// ---------- aviso: la regla de valoración, dicha por quien la conoce ----------
// Consultar NO bloquea —informa—, pero tiene que decir la verdad sobre la regla. Si calla,
// el modelo la deduce de la columna `requiere_valoracion` del SERVICIO y afirma cosas
// sobre el PACIENTE: el 2026-08-28 (exec 27517) contestó "la limpieza no requiere
// valoración previa" a alguien que preguntaba por la regla de la clínica, y le habría
// contestado igual a un paciente nuevo, al que "agendar" después rebota.
//
// Solo se emite cuando cambia lo que el paciente puede hacer. Para el resto de los casos
// viajan los hechos crudos (`paciente_existente`, `valoracion`) y la regla vive en el
// prompt: la política es estable, el estado del paciente no.
const val = loc.valoracion || { estado: 'ninguna', texto: '' };
const proximas = loc.citas_proximas || [];
const esValoracion = VALORACIONES.includes(motor.id_servicio);
const yaValorado = val.estado === 'realizada';
const reglaA = loc.paciente_existente !== true;      // primera visita a la clínica
const reglaB = motor.requiere_valoracion === true;   // el servicio la exige

let avisoRegla = '';
if (esValoracion) {
  avisoRegla = '';
} else if (!yaValorado && reglaA) {
  avisoRegla = val.estado === 'agendada'
    ? `Es su primera visita, así que la clínica pide una valoración inicial antes de ${motor.servicio}. `
      + `Ya tiene la suya agendada para ${val.texto}, y el tratamiento va después de esa.`
    : `Es su primera visita, así que la clínica pide una valoración inicial antes de ${motor.servicio} `
      + '(30 minutos, 15.000 colones, con examen completo, plan por escrito y radiografías).';
} else if (!yaValorado && reglaB) {
  avisoRegla = val.estado === 'agendada'
    ? `${motor.servicio} requiere una valoración previa y usted ya tiene la suya agendada para `
      + `${val.texto}. El tratamiento se agenda después de esa.`
    : `${motor.servicio} requiere una valoración previa (30 minutos, 15.000 colones) antes de reservarlo.`;
} else if (yaValorado && reglaB) {
  avisoRegla = `${motor.servicio} requiere valoración previa, y usted ya la tiene hecha `
    + `(${val.texto}), así que se lo puedo agendar directamente.`;
}

// `nota_valoracion` va SIEMPRE, incluso cuando ninguna regla está activa. Es el hecho ya
// redactado, listo para cuando el paciente pregunte "¿puedo agendar sin valoración?".
// `aviso` es lo que hay que decir sin que lo pidan; esto es lo que hay que decir cuando
// lo piden. Sin este campo el modelo contestaba esa pregunta desde la columna
// `requiere_valoracion` del catálogo y se equivocaba de sujeto: hablaba del servicio
// cuando le preguntaban por la persona (2026-08-28, execs 27517 y 27565).
let notaValoracion;
if (esValoracion) {
  notaValoracion = 'Esta es justamente la cita de valoración inicial.';
} else if (reglaA) {
  notaValoracion = 'La clínica pide una valoración inicial en la primera visita, y esta es '
    + `la suya, así que ${motor.servicio} va después de esa.`;
} else if (reglaB && !yaValorado) {
  notaValoracion = `${motor.servicio} requiere una valoración previa y usted todavía no la tiene`
    + `${val.estado === 'agendada' ? `, aunque ya la tiene agendada para ${val.texto}` : ' hecha'}.`;
} else if (reglaB && yaValorado) {
  notaValoracion = `${motor.servicio} requiere una valoración previa y usted ya la tiene hecha `
    + `(${val.texto}), así que no le hace falta otra.`;
} else {
  notaValoracion = 'La clínica pide la valoración inicial solo en la primera visita. Usted ya '
    + `está registrado con nosotros, así que para ${motor.servicio} no le hace falta.`;
}

// Cada vez que el paciente va a agendar se le recuerdan las citas que ya tiene.
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
    // contexto del paciente: los hechos, para que el modelo no los deduzca
    paciente_existente: loc.paciente_existente === true,
    valoracion: val,
    citas_proximas: proximas,
    aviso: [avisoRegla, recordatorio].filter(Boolean).join(' '),
    nota_valoracion: notaValoracion,
  },
}];
