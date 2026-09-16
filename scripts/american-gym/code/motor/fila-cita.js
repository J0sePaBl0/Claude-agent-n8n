// La cita nace SOLICITADA: el gimnasio la confirma por WhatsApp 24 h antes.
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
      d.id_cliente,
      d.slot.id_entrenador,
      d.id_servicio,
      '',                              // id_membresia
      d.id_oportunidad || '',
      'SEDE-01',
      d.slot.fecha,
      d.slot.hora_inicio,
      d.slot.hora_fin,
      'Solicitada',
      'Bot WhatsApp',
      'FALSE',                         // recordatorio_enviado
      'FALSE',                         // confirmada_por_cliente
      'Bot',
      d.fecha_creacion,
      `Agendada por el bot: ${d.servicio}`,
      '',                              // id_evento_calendar
    ]],
  },
}];