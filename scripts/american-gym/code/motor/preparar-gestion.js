// Un solo nodo para confirmar, cancelar y reagendar. Están juntos a propósito: la cola que
// sigue (escribir en Citas, mover el evento de Calendar, registrar la actividad, responder)
// es la misma para las tres, y con tres nodos distintos esa cola no podría referenciar al
// que corrió. Acá cada acción arma la misma forma:
//
//   { actualizaciones[], borrar_evento, crear_evento, actividad, respuesta }
const TZ = 'America/Costa_Rica';
// Política de cancelación del gimnasio. `CARGO = null` significa que no hay cargo: la cita se
// cancela y listo, sin mencionar montos. En Dulce María era 10.000 colones con menos de 24 h.
// PENDIENTE (info de American Gym): monto y horas de aviso reales.
const CARGO = null;
const HORAS_AVISO = 24;
const montoCargo = () => `${CARGO.toLocaleString('es-CR')} colones`;

const loc = $('Localizar cita').first().json;
const entrada = $('Normalizar entrada').first().json;
const c = loc.cita;
const f = c.fila;
const ahora = DateTime.now().setZone(TZ);
const sello = ahora.toFormat('yyyy-MM-dd HH:mm');
const notaPrevia = String(c.notas || '').trim();

// Datos para el correo de aviso. La sede sale de Config, que ya se leyó en "Preparar
// datos": el sub-workflow de correos no vuelve a tocar Sheets. El correo del cliente
// sale de su ficha; si está vacío, el sub-workflow corta solo y la gestión igual se hizo.
const sede = ($('Preparar datos').first().json.config || [])[0] || {};
const correoBase = {
  email: String((loc.cliente || {}).email || '').trim(),
  nombre_cliente: String((loc.cliente || {}).nombre_completo || '').trim(),
  servicio: c.servicio,
  id_cita: c.id_cita,
  nota: '',
  texto_anterior: '',
  sede_nombre: String(sede.nombre || '').trim(),
  sede_direccion: String(sede.direccion || '').trim(),
  sede_link_maps: String(sede.link_maps || '').trim(),
  sede_telefono: String(sede.telefono || '').trim(),
  sede_whatsapp: String(sede.whatsapp || '').trim(),
};

const base = {
  id_cita: c.id_cita,
  fila: f,
  borrar_evento: null,
  crear_evento: null,
  cargo_por_cancelacion_tardia: false,
  // `tipo` vacío = no se manda correo. Es el caso de confirmar: por decisión del
  // proyecto la confirmación vive ÚNICAMENTE en WhatsApp y no genera correo.
  correo: { ...correoBase, tipo: '', texto_cita: c.texto, entrenador: c.entrenador },
};
const citaPublica = (t, s) => ({
  texto: t, fecha: s.fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin,
  id_entrenador: s.id_entrenador, entrenador: s.entrenador,
});

// ---------------------------------------------------------------- confirmar
if (loc.accion === 'confirmar') {
  return [{ json: { ...base, accion: 'confirmar',
    // K = estado, N = confirmada_por_cliente
    actualizaciones: [
      { range: `Citas!K${f}`, values: [['Confirmada']] },
      { range: `Citas!N${f}`, values: [['TRUE']] },
    ],
    actividad: {
      tipo: 'Confirmación',
      resumen: `El cliente confirmó su cita de ${c.servicio} del ${c.fecha} a las ${c.hora_inicio}`,
      intencion: 'Agendar',
    },
    respuesta: {
      ok: true, motivo: null, disponible: true, agendada: false,
      servicio: c.servicio, id_cita: c.id_cita,
      cita: citaPublica(c.texto, c),
      mensaje: `Listo, su cita de ${c.servicio} quedó confirmada para ${c.texto} con ${c.entrenador}. `
        + `Le esperamos. Si necesita moverla, avísenos con al menos ${HORAS_AVISO} horas de anticipación.`,
    },
  } }];
}

// ---------------------------------------------------------------- cancelar
// La cita se cancela IGUAL aunque el aviso llegue tarde: negarse sería peor que el cargo,
// porque el cliente no va a ir de todos modos y el gimnasio pierde el espacio sin saberlo.
// Acá solo se informa. No se cobra nada.
if (loc.accion === 'cancelar') {
  const horas = DateTime.fromISO(`${c.fecha}T${c.hora_inicio}`, { zone: TZ })
    .diff(ahora, 'hours').hours;
  const tardia = CARGO !== null && horas < HORAS_AVISO;
  const nota = `${notaPrevia} | Cancelada por el cliente el ${sello}`
    + (tardia ? ` (menos de ${HORAS_AVISO} h: cargo de ${montoCargo()})` : ' (sin cargo)');

  return [{ json: { ...base, accion: 'cancelar',
    cargo_por_cancelacion_tardia: tardia,
    correo: {
      ...correoBase,
      tipo: 'cancelada',
      texto_cita: c.texto,
      entrenador: c.entrenador,
      nota: tardia
        ? `Como faltaban menos de ${HORAS_AVISO} horas para la cita, aplica el cargo de `
          + `${montoCargo()} que el gimnasio cobra en su siguiente visita.`
        : '',
    },
    actualizaciones: [
      { range: `Citas!K${f}`, values: [['Cancelada']] },
      { range: `Citas!Q${f}`, values: [[nota.trim()]] },
    ],
    borrar_evento: c.id_evento_calendar && c.id_calendar
      ? { id: c.id_evento_calendar, calendar: c.id_calendar } : null,
    actividad: {
      tipo: 'Seguimiento',
      resumen: `Cita ${c.id_cita} cancelada por el cliente${tardia ? ` con menos de ${HORAS_AVISO} h de aviso` : ''}`,
      intencion: 'Reprogramar',
    },
    respuesta: {
      ok: true, motivo: tardia ? 'cancelada_con_cargo' : null, disponible: false, agendada: false,
      servicio: c.servicio, id_cita: c.id_cita,
      cita: citaPublica(c.texto, c),
      mensaje: `Cancelé su cita de ${c.servicio} del ${c.texto}.`
        + (tardia
          ? ` Como faltaban menos de ${HORAS_AVISO} horas, aplica el cargo de ${montoCargo()} `
            + 'que el gimnasio cobra en la siguiente cita.'
          : ' No tiene ningún cargo.')
        + ' Cuando quiera volver a agendar, con gusto le busco un espacio.',
    },
  } }];
}

// ---------------------------------------------------------------- reagendar
// Se MUEVE la misma fila en vez de cancelar y crear otra: así el id_cita y el token del
// correo siguen sirviendo, y el histórico queda en `notas` y en Actividades. `Reprogramada`
// ya existe en los enums de Config!R, no hubo que inventar un estado.
//
// El evento de Calendar se borra y se recrea en vez de moverse: si cambió el entrenador
// cambió el calendario, y mover un evento entre calendarios no es un PATCH.
const resuelto = $input.first().json;    // viene de "Resolver slot pedido"
const s = resuelto.slot;
const prof = $('Preparar datos').first().json.entrenadores
  .find((p) => String(p.id_entrenador || '').trim() === s.id_entrenador);
const calNuevo = prof ? String(prof.id_calendar || '').trim() : '';

return [{ json: { ...base, accion: 'reagendar',
  correo: {
    ...correoBase,
    tipo: 'reprogramada',
    texto_cita: resuelto.slot_texto,
    entrenador: s.entrenador,
    texto_anterior: c.texto,
  },
  actualizaciones: [
    { range: `Citas!C${f}`, values: [[s.id_entrenador]] },
    // H fecha, I hora_inicio, J hora_fin, K estado: contiguas, una sola escritura
    { range: `Citas!H${f}:K${f}`, values: [[s.fecha, s.hora_inicio, s.hora_fin, 'Reprogramada']] },
    // vuelve a requerir confirmación y a entrar en el recordatorio del día anterior
    { range: `Citas!M${f}:N${f}`, values: [['FALSE', 'FALSE']] },
    { range: `Citas!Q${f}`, values: [[`${notaPrevia} | Reprogramada desde ${c.fecha} ${c.hora_inicio} el ${sello}`.trim()]] },
  ],
  borrar_evento: c.id_evento_calendar && c.id_calendar
    ? { id: c.id_evento_calendar, calendar: c.id_calendar } : null,
  crear_evento: calNuevo ? {
    calendar: calNuevo,
    // Costa Rica es UTC-6 todo el año, sin horario de verano: el offset va explícito
    inicio_iso: `${s.fecha}T${s.hora_inicio}:00-06:00`,
    fin_iso: `${s.fecha}T${s.hora_fin}:00-06:00`,
    summary: `${c.servicio} — ${loc.cliente ? loc.cliente.nombre_completo : ''}`.trim(),
    description: `id_cita: ${c.id_cita}\nid_cliente: ${c.id_cliente}\n`
      + `Reprogramada desde ${c.fecha} ${c.hora_inicio}`,
  } : null,
  actividad: {
    tipo: 'Seguimiento',
    resumen: `Cita ${c.id_cita} reprogramada de ${c.fecha} ${c.hora_inicio} a ${s.fecha} ${s.hora_inicio}`,
    intencion: 'Reprogramar',
  },
  respuesta: {
    ok: true, motivo: null, disponible: true, agendada: true,
    servicio: c.servicio, id_cita: c.id_cita,
    cita: citaPublica(resuelto.slot_texto, s),
    mensaje: `Listo, moví su cita de ${c.servicio}: queda para ${resuelto.slot_texto}. `
      + 'Queda como reprogramada y el gimnasio se la confirma 24 horas antes.',
  },
} }];