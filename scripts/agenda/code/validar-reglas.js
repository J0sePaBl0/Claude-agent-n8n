// Regla de DM_03 que depende SOLO del paciente y del servicio, no de la hora:
// toda persona que nunca ha sido atendida pasa primero por una valoración inicial.
//
// Corre ANTES de resolver a qué espacio se refería el paciente, a propósito. Si corriera
// después, pedir una limpieza a una hora que no existe en la malla devolvería "ese espacio
// no está disponible" y el paciente nuevo se iría con alternativas que no puede reservar.
//
// La otra regla de DM_03 —no dos citas de tratamiento el mismo día— sí depende del espacio
// elegido y se valida en "Confirmar y preparar", contra la relectura fresca de Citas.
//
// Son DOS reglas distintas y hasta el 2026-08-28 se confundían en una sola condición:
//   A. PACIENTE: la primera visita pasa por valoración, sea cual sea el servicio.
//   B. SERVICIO: algunos tratamientos la exigen aunque el paciente ya sea conocido.
// La B no miraba si la valoración había ocurrido, así que rebotaba para siempre: 21 de los
// 35 servicios activos eran inagendables de por vida. Ahora ambas se levantan con una
// valoración YA ATENDIDA, que es lo que `Localizar cita` calcula en `valoracion.estado`.
const SRV_VALORACION = 'SRV-001';
const SRV_VALORACION_NINO = 'SRV-016';

const motor = $input.first().json;
const entrada = $('Normalizar entrada').first().json;
const datos = $('Preparar datos').first().json;
const loc = $('Localizar cita').first().json;

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const soloDigitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');
const telPaciente = soloDigitos(entrada.telefono);

const paciente = datos.pacientes.find((p) => soloDigitos(p.telefono) && soloDigitos(p.telefono) === telPaciente);
const oportunidad = datos.oportunidades.find((o) => soloDigitos(o.telefono) === telPaciente
  && !['Ganada', 'Perdida'].includes(txt(o.etapa)));

const valoracion = loc.valoracion || { estado: 'ninguna', texto: '' };
const proximas = loc.citas_proximas || [];

// Cada vez que se intenta agendar, se le recuerdan al paciente las citas que ya tiene.
// Va en el `mensaje`, redactado para él, no como un dato suelto que el modelo deba
// interpretar por su cuenta.
const recordatorio = proximas.length
  ? ` Por cierto, ya tiene ${proximas.length === 1 ? 'una cita agendada' : `${proximas.length} citas agendadas`}: `
    + `${proximas.map((c) => `${c.servicio}, ${c.texto}`).join('; ')}.`
  : '';

const esValoracion = [SRV_VALORACION, SRV_VALORACION_NINO].includes(motor.id_servicio);
const yaValorado = valoracion.estado === 'realizada';
const reglaA = !paciente;                            // primera visita a la clínica
const reglaB = motor.requiere_valoracion === true;   // el servicio la exige

if (!esValoracion && !yaValorado && (reglaA || reglaB)) {
  const razon = reglaA
    ? 'Como es su primera vez en la clínica, primero necesita una cita de valoración inicial'
    : `${motor.servicio} requiere una valoración previa`;

  // Ya tiene la valoración reservada: no hay nada nuevo que ofrecerle, solo esperar a que
  // ocurra. Ofrecerle más horarios de valoración acá sería empujarlo a duplicarla.
  if (valoracion.estado === 'agendada') {
    return [{
      json: {
        ok: false, accion: 'agendar', motivo: 'requiere_valoracion_previa', disponible: false,
        interpretacion: motor.interpretacion, servicio: motor.servicio,
        id_servicio_sugerido: null,
        valoracion, citas_proximas: proximas, paciente_existente: !!paciente,
        nota_valoracion: `${motor.servicio} requiere una valoración previa y la suya ya está `
          + `agendada para ${valoracion.texto}.`,
        mensaje: `${razon}, y usted ya tiene la suya agendada para ${valoracion.texto}. `
          + `${motor.servicio} se agenda después de esa cita.${recordatorio}`,
        alternativas: [],
      },
    }];
  }

  // Horarios REALES de la valoración, calculados por "Calcular slots libres" sobre los
  // mismos datos ya leídos. Antes esto devolvía `alternativas: []` y un mensaje escrito
  // para el modelo ("consulte la disponibilidad..."), confiando en que hiciera una segunda
  // llamada. No siempre la hacía, y el paciente se quedaba sin una sola hora concreta.
  // Un contrato que depende de que el modelo haga algo es un contrato roto.
  const TZ = 'America/Costa_Rica';
  const enEspanol = (s) => {
    const d = DateTime.fromISO(s.fecha, { zone: TZ }).setLocale('es');
    const [hh, mm] = String(s.hora_inicio).split(':').map(Number);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${d.toFormat("cccc d 'de' LLLL")}, ${h12}:${String(mm).padStart(2, '0')}`
      + `${hh < 12 ? ' a. m.' : ' p. m.'}, con ${s.profesional}`;
  };
  const vistos = new Set();
  const alternativas = (motor.slots_valoracion || [])
    .filter((s) => {
      const clave = s.fecha + '|' + s.hora_inicio;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, 6)
    .map((s) => ({
      texto: enEspanol(s), fecha: s.fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin,
      id_profesional: s.id_profesional, profesional: s.profesional,
    }));

  return [{
    json: {
      ok: false, accion: 'agendar', motivo: 'requiere_valoracion_previa', disponible: false,
      interpretacion: motor.interpretacion, servicio: motor.servicio,
      // por si el agente prefiere volver a consultar disponibilidad con ESTE servicio
      id_servicio_sugerido: SRV_VALORACION,
      valoracion, citas_proximas: proximas, paciente_existente: !!paciente,
      nota_valoracion: reglaA
        ? 'La clínica pide una valoración inicial en la primera visita, y esta es la suya, '
          + `así que ${motor.servicio} va después de esa.`
        : `${motor.servicio} requiere una valoración previa y usted todavía no la tiene hecha.`,
      mensaje: `${razon}. Dura 30 minutos, cuesta 15.000 colones e incluye el examen completo, `
        + 'el plan de tratamiento por escrito y las radiografías necesarias.'
        + (alternativas.length
          ? ` Le puedo ofrecer: ${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`
          : '')
        + recordatorio,
      alternativas,
    },
  }];
}

return [{
  json: {
    ...motor,
    ok: true,
    paciente_existente: !!paciente,
    id_paciente: paciente ? txt(paciente.id_paciente) : null,
    nombre_paciente: paciente ? txt(paciente.nombre_completo) : txt(entrada.nombre_paciente),
    telefono: txt(entrada.telefono),
    id_oportunidad: oportunidad ? txt(oportunidad.id_oportunidad) : null,
    paciente_row: paciente || null,
    // viajan hasta "Respuesta agendada" para poder recordarle sus otras citas
    valoracion,
    citas_proximas: proximas,
  },
}];
