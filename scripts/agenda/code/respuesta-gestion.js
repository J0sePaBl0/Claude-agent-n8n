// Lleva la salida al contrato del sub-workflow, igual que hace "Respuesta agendada".
const prep = $('Preparar gestión').first().json;
return [{
  json: {
    ...prep.respuesta,
    interpretacion: prep.respuesta.cita.texto,
    cargo_por_cancelacion_tardia: prep.cargo_por_cancelacion_tardia === true,
    alternativas: [prep.respuesta.cita],
    // Payload para "Enviar correo de la cita". En `confirmar` viene con `tipo` vacío y el
    // sub-workflow de correos corta: la confirmación vive únicamente en WhatsApp.
    correo: prep.correo || { tipo: '' },
  },
}];
