const d = $('Confirmar y preparar').first().json;
return [{
  json: {
    id_oportunidad: d.id_oportunidad,
    id_cliente: d.id_cliente,
    etapa: 'Cita agendada',
    fecha_ultima_interaccion: d.fecha_creacion,
  },
}];