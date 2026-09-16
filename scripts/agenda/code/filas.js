// --- fila-cita ---
// La cita nace SOLICITADA: la clínica la confirma por WhatsApp 24 h antes (DM_03).
//
// Va como arreglo de celdas en el orden de las columnas A:R, no como objeto, porque se
// escribe con values:append y valueInputOption=RAW. Con el nodo normal de Sheets, Google
// interpreta "08:30" como una hora y lo devuelve como "8:30", que no cuadra con el resto
// de la hoja.
const d = $('Confirmar y preparar').first().json;
return [{
  json: {
    valores: [[
      d.id_cita,
      d.id_paciente,
      d.slot.id_profesional,
      d.id_servicio,
      '',                              // id_tratamiento
      d.id_oportunidad || '',
      'SEDE-01',
      d.slot.fecha,
      d.slot.hora_inicio,
      d.slot.hora_fin,
      'Solicitada',
      'Bot WhatsApp',
      'FALSE',                         // recordatorio_enviado
      'FALSE',                         // confirmada_por_paciente
      'Bot',
      d.fecha_creacion,
      `Agendada por el bot: ${d.servicio}`,
      '',                              // id_evento_calendar
    ]],
  },
}];

// --- fila-paciente ---
// Se reescriben solo los campos seguros; para un paciente que ya existe son los
// mismos valores que ya tenía, así que es un no-op.
const d = $('Confirmar y preparar').first().json;
const p = d.paciente_row || {};
return [{
  json: {
    id_paciente: d.id_paciente,
    nombre_completo: d.nombre_paciente,
    telefono: d.telefono,
    // Pacientes!D. `email_paciente` ya viene resuelto (el que dictó ahora, o el que ya
    // estaba en la hoja), así que para un paciente que no dio correo esto reescribe el
    // mismo valor y nunca lo borra.
    email: d.email_paciente || p.email || '',
    sede_preferida: p.sede_preferida || 'SEDE-01',
    estado: p.estado || 'Nuevo',
    fecha_registro: p.fecha_registro || d.fecha_creacion.slice(0, 10),
    canal_origen: p.canal_origen || 'WhatsApp',
    consentimiento_datos: p.consentimiento_datos || 'TRUE',
  },
}];

// --- fila-oportunidad ---
const d = $('Confirmar y preparar').first().json;
return [{
  json: {
    id_oportunidad: d.id_oportunidad,
    id_paciente: d.id_paciente,
    etapa: 'Cita agendada',
    fecha_ultima_interaccion: d.fecha_creacion,
  },
}];

// --- fila-actividad ---
const d = $('Confirmar y preparar').first().json;
return [{
  json: {
    id_actividad: d.id_actividad,
    fecha_hora: d.fecha_creacion,
    id_paciente: d.id_paciente,
    id_oportunidad: d.id_oportunidad || '',
    id_cita: d.id_cita,
    canal: 'WhatsApp',
    tipo: 'Confirmación',
    direccion: 'Entrante',
    resumen: `Cita solicitada por el bot: ${d.servicio}, ${d.slot.fecha} ${d.slot.hora_inicio}`,
    intencion: 'Agendar',
    sentimiento: 'Positivo',
    generado_por: 'Bot',
    requiere_seguimiento: 'FALSE',
    url_documento: '',
  },
}];

// --- respuesta-agendada ---
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
      id_profesional: d.slot.id_profesional,
      profesional: d.slot.profesional,
    },
    alternativas: [],
    mensaje: `Cita solicitada para ${d.slot_texto}. Queda registrada como SOLICITADA: `
      + `la clínica la confirma por WhatsApp 24 horas antes.${recordatorio}`,
    paciente_existente: loc.paciente_existente === true,
    valoracion: loc.valoracion || { estado: 'ninguna', texto: '' },
    citas_proximas: previas,
    aviso: recordatorio.trim(),
    // Payload para "Enviar correo de la cita". Si el paciente no dio correo, `email` va
    // vacío y el sub-workflow corta solo: la cita ya quedó escrita igual.
    correo: {
      tipo: 'nueva',
      email: d.email_paciente || '',
      nombre_paciente: d.nombre_paciente,
      servicio: d.servicio,
      texto_cita: d.slot_texto,
      profesional: d.slot.profesional,
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

// --- respuesta ---
// Único punto de salida del sub-workflow. Garantiza la forma del contrato: nunca vacío,
// siempre con mensaje y con alternativas.
const j = $input.first().json;

// Un profesional por fecha+hora, acá y no en cada rama: al paciente le importa la hora,
// no con quién. Sin esto una valoración —que la hacen los cuatro— se ofrecería como
// "9:00 con Dulce María" y "9:00 con Carolina" como si fueran dos espacios distintos.
const vistos = new Set();
const alternativas = (Array.isArray(j.alternativas) ? j.alternativas : []).filter((a) => {
  const clave = `${a.fecha}|${a.hora_inicio}`;
  if (vistos.has(clave)) return false;
  vistos.add(clave);
  return true;
});
return [{
  json: {
    ok: j.ok !== false,
    interpretacion: j.interpretacion || 'lo más próximo disponible',
    servicio: j.servicio || '',
    disponible: j.disponible === true,
    agendada: j.agendada === true,
    motivo: j.motivo || null,
    // cuando la regla de valoración previa bloquea, el agente tiene que volver a
    // consultar disponibilidad con ESTE servicio. Va en null cuando el paciente YA tiene
    // la valoración agendada: ahí no hay nada que consultar, solo que llegue el día.
    id_servicio_sugerido: j.id_servicio_sugerido || null,
    id_cita: j.id_cita || null,
    cita: j.cita || null,
    alternativas,
    mensaje: j.mensaje || 'No pude resolver la consulta de agenda.',
    // Contexto del paciente. Este nodo es un whitelist: lo que no se nombre acá, no sale.
    // `paciente_existente` y `valoracion` son HECHOS que el modelo no puede deducir de
    // `catalogo_servicios` —esa hoja habla del servicio, no de la persona— y `aviso` es
    // la explicación ya redactada de por qué se puede o no agendar.
    paciente_existente: j.paciente_existente === true,
    valoracion: j.valoracion || { estado: 'ninguna', texto: '' },
    citas_proximas: Array.isArray(j.citas_proximas) ? j.citas_proximas : [],
    aviso: j.aviso || '',
    // `aviso` es lo que hay que decir sin que lo pidan; `nota_valoracion` es lo que hay
    // que decir cuando el paciente pregunta por la regla. Va siempre poblado.
    nota_valoracion: j.nota_valoracion || '',
  },
}];
