// Se esperó el turno demasiado tiempo (ver "¿Seguir esperando?"). No se escribió nada: se
// devuelve un "no" con motivo propio para que el agente pida reintentar en vez de prometer
// una cita que no existe.
return [{
  json: {
    ok: false,
    agendada: false,
    disponible: false,
    motivo: 'agenda_ocupada',
    interpretacion: '',
    alternativas: [],
    mensaje: 'En este momento hay muchas reservas entrando al mismo tiempo y no pude '
      + 'registrar la suya. Inténtelo de nuevo en un minuto.',
  },
}];
