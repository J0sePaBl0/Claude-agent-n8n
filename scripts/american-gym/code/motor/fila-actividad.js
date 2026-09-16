const d = $('Confirmar y preparar').first().json;
return [{
  json: {
    id_actividad: d.id_actividad,
    fecha_hora: d.fecha_creacion,
    id_cliente: d.id_cliente,
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