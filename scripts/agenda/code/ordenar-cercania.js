// Ordena los espacios libres por cercanía a lo que el paciente pidió y arma el mensaje.
// El contrato es que NUNCA se devuelva vacío ni un "no hay" pelado: un resultado vacío
// es exactamente lo que hace alucinar al modelo.
const TZ = 'America/Costa_Rica';
const MAX_ALTERNATIVAS = 6;

const motor = $input.first().json;
const pedido = $('Interpretar la fecha').first().json;

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
  },
}];
