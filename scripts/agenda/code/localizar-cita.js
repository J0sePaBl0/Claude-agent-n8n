// De qué cita habla el paciente. Es la puerta de entrada de confirmar, cancelar y reagendar,
// y además decide con qué servicio calcula espacios el motor cuando se reagenda.
//
// Dos vías de entrada, a propósito:
//   · con `token`  → viene de un enlace del correo e identifica una cita concreta.
//   · sin `token`  → viene del agente por WhatsApp y se resuelve por teléfono.
//
// Ninguna de las dos le pide `id_cita` al modelo: cada dato que el modelo no tiene que
// llenar es un dato que no puede inventar. Mismo criterio que con `id_oportunidad`.
const GESTION = ['confirmar', 'cancelar', 'reagendar'];
const ACTIVAS = ['Solicitada', 'Confirmada', 'Reprogramada'];
const TZ = 'America/Costa_Rica';

// Va DESPUÉS de "Interpretar la fecha" para poder desambiguar "la del jueves" reusando el
// resolver, así que los datos del CRM se piden por nombre y no por $input.
const datos = $('Preparar datos').first().json;
const entrada = $('Normalizar entrada').first().json;
const pedido = $('Interpretar la fecha').first().json;
const accion = String(entrada.accion || '').trim();

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const digitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');

// Consultar y agendar no localizan nada: siguen de largo con el servicio que pidió el modelo.
if (!GESTION.includes(accion)) {
  return [{ json: { ok: true, accion, id_servicio: txt(entrada.id_servicio), cita: null, paciente: null } }];
}

const fallar = (motivo, mensaje, opciones = []) => [{
  json: { ok: false, accion, motivo, mensaje, disponible: false, alternativas: opciones, cita: null },
}];

const enEspanol = (c) => {
  const d = DateTime.fromISO(txt(c.fecha), { zone: TZ }).setLocale('es');
  const [hh, mm] = txt(c.hora_inicio).split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${d.toFormat("cccc d 'de' LLLL")}, ${h12}:${String(mm).padStart(2, '0')}`
    + `${hh < 12 ? ' a. m.' : ' p. m.'}`;
};
const publico = (c) => ({
  texto: enEspanol(c), fecha: txt(c.fecha), hora_inicio: txt(c.hora_inicio),
  hora_fin: txt(c.hora_fin), id_profesional: txt(c.id_profesional), id_cita: txt(c.id_cita),
});

const hoy = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
const token = txt(entrada.token);
let cita = null;
let paciente = null;

if (token) {
  cita = datos.citas.find((c) => txt(c.token_gestion) === token) || null;
  if (!cita) {
    return fallar('token_invalido',
      'Este enlace ya no es válido. Escríbanos por WhatsApp y le ayudamos con su cita.');
  }
  if (!ACTIVAS.includes(txt(cita.estado))) {
    return fallar('cita_no_activa',
      `Esa cita figura como ${txt(cita.estado).toLowerCase()}, así que no hay nada pendiente por hacer.`);
  }
  paciente = datos.pacientes.find((p) => txt(p.id_paciente) === txt(cita.id_paciente)) || null;
} else {
  const tel = digitos(entrada.telefono);
  paciente = datos.pacientes.find((p) => digitos(p.telefono) && digitos(p.telefono) === tel) || null;
  if (!paciente) {
    return fallar('sin_citas',
      'No encuentro ninguna cita a su nombre. ¿Quiere que le busque un espacio?');
  }

  let suyas = datos.citas
    .filter((c) => txt(c.id_paciente) === txt(paciente.id_paciente)
      && ACTIVAS.includes(txt(c.estado)) && txt(c.fecha) >= hoy)
    .sort((a, b) => (txt(a.fecha) + txt(a.hora_inicio)).localeCompare(txt(b.fecha) + txt(b.hora_inicio)));

  if (!suyas.length) {
    return fallar('sin_citas',
      'No tiene citas próximas agendadas. ¿Quiere que le busque un espacio?');
  }

  // Si el paciente dijo de cuál habla ("la del jueves"), se filtra por lo que entendió el
  // resolver de fechas. Reusa esa pieza en vez de repetir un mini-parser acá.
  if (suyas.length > 1 && pedido.dia_especifico) {
    const delDia = suyas.filter((c) => txt(c.fecha) === pedido.desde);
    if (delDia.length) suyas = delDia;
  }

  // Se devuelven TODAS, no las primeras N. Una lista cortada hace que el modelo afirme que
  // algo no existe: es el bug del 2026-08-07 con otro disfraz.
  if (suyas.length > 1) {
    const cuál = suyas.length === 2 ? '¿Cuál de las dos?' : '¿Cuál de ellas?';
    return fallar('ambiguo',
      `Tiene ${suyas.length} citas próximas: ${suyas.map(enEspanol).join('; ')}. ${cuál}`,
      suyas.map(publico));
  }
  cita = suyas[0];
}

const servicio = datos.servicios.find((s) => txt(s.id_servicio) === txt(cita.id_servicio));
const profesional = datos.profesionales.find((p) => txt(p.id_profesional) === txt(cita.id_profesional));

return [{
  json: {
    ok: true,
    accion,
    // Al reagendar, el servicio sale de la CITA, no de lo que diga el modelo: se mueve la
    // misma cita, no se inventa otra. "Calcular slots libres" lee este campo.
    id_servicio: txt(cita.id_servicio),
    cita: {
      ...cita,
      fila: cita.row_number,
      texto: enEspanol(cita),
      servicio: servicio ? txt(servicio.nombre) : txt(cita.id_servicio),
      duracion_min: servicio ? (parseInt(txt(servicio.duracion_min), 10) || 30) : 30,
      profesional: profesional ? txt(profesional.nombre) : txt(cita.id_profesional),
      id_calendar: profesional ? txt(profesional.id_calendar) : '',
    },
    paciente: paciente ? { ...paciente, fila: paciente.row_number } : null,
  },
}];
