// Único punto de salida del sub-workflow. Garantiza la forma del contrato: nunca vacío,
// siempre con mensaje y con alternativas.
const j = $input.first().json;

// Un entrenador por fecha+hora, acá y no en cada rama: al cliente le importa la hora,
// no con quién. Sin esto un servicio que dan varios entrenadores se ofrecería como
// "6:00 con Ana" y "6:00 con Luis" como si fueran dos espacios distintos.
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
    // Solo lo llena la regla de valoración previa, que en American Gym está apagada
    // (REGLAS_POR_TIPO): hoy siempre es null.
    id_servicio_sugerido: j.id_servicio_sugerido || null,
    id_cita: j.id_cita || null,
    cita: j.cita || null,
    alternativas,
    mensaje: j.mensaje || 'No pude resolver la consulta de agenda.',
    // Contexto del cliente. Este nodo es un whitelist: lo que no se nombre acá, no sale.
    // `cliente_existente` y `citas_proximas` son HECHOS que el modelo no puede deducir de
    // `catalogo_servicios` —esa hoja habla del servicio, no de la persona— y `aviso` es
    // lo que hay que decirle sin que lo pida, ya redactado.
    // `valoracion` y `nota_valoracion` NO salen: son de las reglas por tipo de cita, apagadas
    // en American Gym. Si se encienden, hay que volver a nombrarlos acá y en el prompt.
    // Clase grupal con cupo (Servicios.cupo > 1) o cita 1 a 1.
    es_clase_grupal: j.es_clase_grupal === true,
    cliente_existente: j.cliente_existente === true,
    // El nombre real del cliente (el de Clientes!B, no el del perfil de WhatsApp) y si ya
    // tenemos su correo. Con esto el agente lo trata por su nombre y no vuelve a pedirle
    // datos que ya dio.
    nombre_registrado: j.nombre_registrado || '',
    email_registrado: j.email_registrado === true,
    citas_proximas: Array.isArray(j.citas_proximas) ? j.citas_proximas : [],
    aviso: j.aviso || '',
  },
}];