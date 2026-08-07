// --- preparar-gestion ---
// Un solo nodo para confirmar, cancelar y reagendar. Están juntos a propósito: la cola que
// sigue (escribir en Citas, mover el evento de Calendar, registrar la actividad, responder)
// es la misma para las tres, y con tres nodos distintos esa cola no podría referenciar al
// que corrió. Acá cada acción arma la misma forma:
//
//   { actualizaciones[], borrar_evento, crear_evento, actividad, respuesta }
const TZ = 'America/Costa_Rica';
const CARGO = 10000;

const loc = $('Localizar cita').first().json;
const entrada = $('Normalizar entrada').first().json;
const c = loc.cita;
const f = c.fila;
const ahora = DateTime.now().setZone(TZ);
const sello = ahora.toFormat('yyyy-MM-dd HH:mm');
const notaPrevia = String(c.notas || '').trim();

const base = {
  id_cita: c.id_cita,
  fila: f,
  borrar_evento: null,
  crear_evento: null,
  cargo_por_cancelacion_tardia: false,
};
const citaPublica = (t, s) => ({
  texto: t, fecha: s.fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin,
  id_profesional: s.id_profesional, profesional: s.profesional,
});

// ---------------------------------------------------------------- confirmar
if (loc.accion === 'confirmar') {
  return [{ json: { ...base, accion: 'confirmar',
    // K = estado, N = confirmada_por_paciente
    actualizaciones: [
      { range: `Citas!K${f}`, values: [['Confirmada']] },
      { range: `Citas!N${f}`, values: [['TRUE']] },
    ],
    actividad: {
      tipo: 'Confirmación',
      resumen: `El paciente confirmó su cita de ${c.servicio} del ${c.fecha} a las ${c.hora_inicio}`,
      intencion: 'Agendar',
    },
    respuesta: {
      ok: true, motivo: null, disponible: true, agendada: false,
      servicio: c.servicio, id_cita: c.id_cita,
      cita: citaPublica(c.texto, c),
      mensaje: `Listo, su cita de ${c.servicio} quedó confirmada para ${c.texto} con ${c.profesional}. `
        + 'Le esperamos. Si necesita moverla, avísenos con al menos 24 horas de anticipación.',
    },
  } }];
}

// ---------------------------------------------------------------- cancelar
// DM_04, textual: "Las citas se pueden cancelar o reprogramar sin costo hasta veinticuatro
// horas antes de la hora agendada. Las cancelaciones con menos de veinticuatro horas de
// aviso generan un cargo de 10.000 colones, que se cobra en la siguiente cita."
//
// La cita se cancela IGUAL aunque falten menos de 24 h: negarse sería peor que el cargo,
// porque el paciente no va a ir de todos modos y la clínica pierde el espacio sin saberlo.
// Acá solo se informa. No se cobra nada ni se lleva la cuenta de las tres ausencias.
if (loc.accion === 'cancelar') {
  const horas = DateTime.fromISO(`${c.fecha}T${c.hora_inicio}`, { zone: TZ })
    .diff(ahora, 'hours').hours;
  const tardia = horas < 24;
  const nota = `${notaPrevia} | Cancelada por el paciente el ${sello}`
    + (tardia ? ` (menos de 24 h: cargo de ${CARGO.toLocaleString('es-CR')} colones)` : ' (sin cargo)');

  return [{ json: { ...base, accion: 'cancelar',
    cargo_por_cancelacion_tardia: tardia,
    actualizaciones: [
      { range: `Citas!K${f}`, values: [['Cancelada']] },
      { range: `Citas!Q${f}`, values: [[nota.trim()]] },
    ],
    borrar_evento: c.id_evento_calendar && c.id_calendar
      ? { id: c.id_evento_calendar, calendar: c.id_calendar } : null,
    actividad: {
      tipo: 'Seguimiento',
      resumen: `Cita ${c.id_cita} cancelada por el paciente${tardia ? ' con menos de 24 h de aviso' : ''}`,
      intencion: 'Reprogramar',
    },
    respuesta: {
      ok: true, motivo: tardia ? 'cancelada_con_cargo' : null, disponible: false, agendada: false,
      servicio: c.servicio, id_cita: c.id_cita,
      cita: citaPublica(c.texto, c),
      mensaje: `Cancelé su cita de ${c.servicio} del ${c.texto}.`
        + (tardia
          ? ` Como faltaban menos de 24 horas, aplica el cargo de ${CARGO.toLocaleString('es-CR')} `
            + 'colones que la clínica cobra en la siguiente cita.'
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
// El evento de Calendar se borra y se recrea en vez de moverse: si cambió el profesional
// cambió el calendario, y mover un evento entre calendarios no es un PATCH.
const resuelto = $input.first().json;    // viene de "Resolver slot pedido"
const s = resuelto.slot;
const prof = $('Preparar datos').first().json.profesionales
  .find((p) => String(p.id_profesional || '').trim() === s.id_profesional);
const calNuevo = prof ? String(prof.id_calendar || '').trim() : '';

return [{ json: { ...base, accion: 'reagendar',
  actualizaciones: [
    { range: `Citas!C${f}`, values: [[s.id_profesional]] },
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
    summary: `${c.servicio} — ${loc.paciente ? loc.paciente.nombre_completo : ''}`.trim(),
    description: `id_cita: ${c.id_cita}\nid_paciente: ${c.id_paciente}\n`
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
      + 'Queda como reprogramada y la clínica se la confirma 24 horas antes.',
  },
} }];

// --- actividad-gestion ---
// Una fila en Actividades por cada gestión, con los enums que ya viven en Config.
const prep = $('Preparar gestión').first().json;
const loc = $('Localizar cita').first().json;
const datos = $('Preparar datos').first().json;

const ids = datos.actividades
  .map((a) => parseInt(String(a.id_actividad || '').replace(/\D/g, ''), 10))
  .filter((n) => !Number.isNaN(n));

return [{
  json: {
    id_actividad: 'ACT-' + String((ids.length ? Math.max(...ids) : 0) + 1).padStart(5, '0'),
    fecha_hora: DateTime.now().setZone('America/Costa_Rica').toFormat('yyyy-MM-dd HH:mm'),
    id_paciente: loc.cita.id_paciente,
    id_oportunidad: loc.cita.id_oportunidad || '',
    id_cita: loc.cita.id_cita,
    // si vino con token, el paciente entró por el enlace del correo, no por WhatsApp
    canal: String($('Normalizar entrada').first().json.token || '').trim() ? 'Email' : 'WhatsApp',
    tipo: prep.actividad.tipo,
    direccion: 'Entrante',
    resumen: prep.actividad.resumen,
    intencion: prep.actividad.intencion,
    sentimiento: 'Neutro',
    generado_por: 'Bot',
    requiere_seguimiento: 'FALSE',
    url_documento: '',
  },
}];

// --- respuesta-gestion ---
// Lleva la salida al contrato del sub-workflow, igual que hace "Respuesta agendada".
const prep = $('Preparar gestión').first().json;
return [{
  json: {
    ...prep.respuesta,
    interpretacion: prep.respuesta.cita.texto,
    cargo_por_cancelacion_tardia: prep.cargo_por_cancelacion_tardia === true,
    alternativas: [prep.respuesta.cita],
  },
}];
