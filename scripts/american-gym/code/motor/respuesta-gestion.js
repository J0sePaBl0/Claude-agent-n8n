// Lleva la salida al contrato del sub-workflow, igual que hace "Respuesta agendada".
const prep = $('Preparar gestión').first().json;
const loc = $('Localizar cita').first().json;
return [{
  json: {
    ...prep.respuesta,
    interpretacion: prep.respuesta.cita.texto,
    // Contexto del cliente, igual que en las otras dos salidas: cancelar o confirmar no
    // puede hacer que el agente deje de tratarlo por su nombre.
    cliente_existente: loc.cliente_existente === true,
    nombre_registrado: loc.nombre_registrado || '',
    email_registrado: loc.email_registrado === true,
    cargo_por_cancelacion_tardia: prep.cargo_por_cancelacion_tardia === true,
    alternativas: [prep.respuesta.cita],
    // Payload para "Enviar correo de la cita". En `confirmar` viene con `tipo` vacío y el
    // sub-workflow de correos corta: la confirmación vive únicamente en WhatsApp.
    correo: prep.correo || { tipo: '' },
  },
}];
