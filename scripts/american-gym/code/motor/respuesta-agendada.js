const d = $('Confirmar y preparar').first().json;
const loc = $('Localizar cita').first().json;

// Las citas que YA tenía ANTES de esta (el contexto se calculó al entrar, antes de
// escribir). Se le recuerdan al confirmar para que no se le junten dos sin darse cuenta.
const previas = loc.citas_proximas || [];
const recordatorio = previas.length
  ? ` Además de esta, ya tenía ${previas.length === 1 ? 'una cita' : `${previas.length} citas`}: `
    + `${previas.map((c) => `${c.servicio}, ${c.texto}`).join('; ')}.`
  : '';

return [{
  json: {
    ok: true,
    accion: 'agendar',
    agendada: true,
    disponible: true,
    motivo: null,
    interpretacion: d.interpretacion,
    servicio: d.servicio,
    id_cita: d.id_cita,
    cita: {
      texto: d.slot_texto,
      fecha: d.slot.fecha,
      hora_inicio: d.slot.hora_inicio,
      hora_fin: d.slot.hora_fin,
      id_entrenador: d.slot.id_entrenador,
      entrenador: d.slot.entrenador,
    },
    alternativas: [],
    mensaje: `Cita solicitada para ${d.slot_texto}. Queda registrada como SOLICITADA: `
      + `el gimnasio la confirma por WhatsApp 24 horas antes.${recordatorio}`,
    cliente_existente: loc.cliente_existente === true,
    // El nombre con el que quedó la ficha: si el cliente lo dictó en este mismo turno, es
    // el nuevo, no el que había en la hoja al entrar.
    nombre_registrado: d.nombre_cliente || loc.nombre_registrado || '',
    email_registrado: !!(d.email_cliente || loc.email_registrado),
    citas_proximas: previas,
    aviso: recordatorio.trim(),
    // Payload para "Enviar correo de la cita". Si el cliente no dio correo, `email` va
    // vacío y el sub-workflow corta solo: la cita ya quedó escrita igual.
    correo: {
      tipo: 'nueva',
      email: d.email_cliente || '',
      nombre_cliente: d.nombre_cliente,
      servicio: d.servicio,
      texto_cita: d.slot_texto,
      entrenador: d.slot.entrenador,
      id_cita: d.id_cita,
      nota: '',
      texto_anterior: '',
      sede_nombre: (d.sede || {}).nombre || '',
      sede_direccion: (d.sede || {}).direccion || '',
      sede_link_maps: (d.sede || {}).link_maps || '',
      sede_telefono: (d.sede || {}).telefono || '',
      sede_whatsapp: (d.sede || {}).whatsapp || '',
    },
  },
}];