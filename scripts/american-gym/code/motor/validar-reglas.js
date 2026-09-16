// Identifica al cliente y a su oportunidad abierta antes de agendar, y aplica las reglas que
// dependen del TIPO de cita.
//
// En American Gym esas reglas están APAGADAS (REGLAS_POR_TIPO = false, decisión del
// 2026-09-11): cualquier cliente agenda cualquier servicio, y este nodo solo arma los datos
// del cliente para la escritura. El camino queda escrito para encenderlo. Viene de Dulce
// María, donde había dos reglas distintas:
//   A. PERSONA: la primera visita pasa por una valoración, sea cual sea el servicio.
//   B. SERVICIO: algunos servicios la exigen aunque el cliente ya sea conocido.
// Ambas se levantan con una valoración YA ATENDIDA (`valoracion.estado` de "Localizar cita").
// Corre ANTES de resolver a qué espacio se refería el cliente, a propósito: si corriera
// después, el cliente nuevo se iría con alternativas que no puede reservar.
const REGLAS_POR_TIPO = false;
const VALORACIONES = ['SRV-001'];

const motor = $input.first().json;
const entrada = $('Normalizar entrada').first().json;
const datos = $('Preparar datos').first().json;
const loc = $('Localizar cita').first().json;

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const soloDigitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');
const telCliente = soloDigitos(entrada.telefono);

const cliente = datos.clientes.find((p) => soloDigitos(p.telefono) && soloDigitos(p.telefono) === telCliente);
const oportunidad = datos.oportunidades.find((o) => soloDigitos(o.telefono) === telCliente
  && !['Ganada', 'Perdida'].includes(txt(o.etapa)));

const valoracion = loc.valoracion || { estado: 'ninguna', texto: '' };
const proximas = loc.citas_proximas || [];

// Cada vez que se intenta agendar, se le recuerdan al cliente las citas que ya tiene.
// Va en el `mensaje`, redactado para él, no como un dato suelto que el modelo deba
// interpretar por su cuenta.
const recordatorio = proximas.length
  ? ` Por cierto, ya tiene ${proximas.length === 1 ? 'una cita agendada' : `${proximas.length} citas agendadas`}: `
    + `${proximas.map((c) => `${c.servicio}, ${c.texto}`).join('; ')}.`
  : '';

const bloquea = REGLAS_POR_TIPO
  && !VALORACIONES.includes(motor.id_servicio)
  && valoracion.estado !== 'realizada'
  && (!cliente || motor.requiere_valoracion === true);

if (bloquea) {
  // El detalle de la valoración (duración, precio) tiene que salir de su fila en Servicios
  // cuando se encienda la regla: nunca escrito acá a mano. En Dulce María estaba fijo en el
  // texto y habría quedado desactualizado con el primer cambio de precio.
  const sv = datos.servicios.find((s) => txt(s.id_servicio) === VALORACIONES[0]) || {};
  const detalle = sv.nombre ? ` (${txt(sv.nombre)}, ${txt(sv.duracion_min)} minutos)` : '';
  if (valoracion.estado === 'agendada') {
    return [{ json: {
      ok: false, accion: 'agendar', motivo: 'requiere_valoracion_previa', disponible: false,
      interpretacion: motor.interpretacion, servicio: motor.servicio, id_servicio_sugerido: null,
      citas_proximas: proximas, cliente_existente: !!cliente,
      nombre_registrado: loc.nombre_registrado || '', email_registrado: loc.email_registrado === true,
      mensaje: `${motor.servicio} va después de su evaluación inicial, que ya tiene agendada para `
        + `${valoracion.texto}.${recordatorio}`,
      alternativas: [],
    } }];
  }
  return [{ json: {
    ok: false, accion: 'agendar', motivo: 'requiere_valoracion_previa', disponible: false,
    interpretacion: motor.interpretacion, servicio: motor.servicio,
    id_servicio_sugerido: VALORACIONES[0],
    citas_proximas: proximas, cliente_existente: !!cliente,
    nombre_registrado: loc.nombre_registrado || '', email_registrado: loc.email_registrado === true,
    mensaje: `Antes de ${motor.servicio} el gimnasio pide una evaluación inicial${detalle}.${recordatorio}`,
    alternativas: (motor.slots_valoracion || []).slice(0, 6),
  } }];
}

return [{
  json: {
    ...motor,
    ok: true,
    cliente_existente: !!cliente,
    nombre_registrado: loc.nombre_registrado || '',
    email_registrado: loc.email_registrado === true,
    id_cliente: cliente ? txt(cliente.id_cliente) : null,
    // Orden de precedencia del nombre con el que se escribe la ficha en Clientes:
    //   1. el que el cliente acaba de dictarle al agente (`nombre_dictado`);
    //   2. el que ya estaba en la hoja;
    //   3. el del perfil de WhatsApp, que es el último recurso porque suele ser un apodo
    //      o el nombre de otra persona.
    // Que el dictado gane al de la hoja es lo mismo que se hace con el correo en
    // "Confirmar y preparar": si lo vuelve a dictar es porque el que había no servía.
    nombre_cliente: txt(entrada.nombre_dictado)
      || (cliente ? txt(cliente.nombre_completo) : '')
      || txt(entrada.nombre_cliente),
    telefono: txt(entrada.telefono),
    id_oportunidad: oportunidad ? txt(oportunidad.id_oportunidad) : null,
    cliente_row: cliente || null,
    // viajan hasta "Respuesta agendada" para poder recordarle sus otras citas
    citas_proximas: proximas,
  },
}];
