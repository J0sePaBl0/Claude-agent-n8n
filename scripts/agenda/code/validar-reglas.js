// Regla de DM_03 que depende SOLO del paciente y del servicio, no de la hora:
// toda persona que nunca ha sido atendida pasa primero por una valoración inicial.
//
// Corre ANTES de resolver a qué espacio se refería el paciente, a propósito. Si corriera
// después, pedir una limpieza a una hora que no existe en la malla devolvería "ese espacio
// no está disponible" y el paciente nuevo se iría con alternativas que no puede reservar.
//
// La otra regla de DM_03 —no dos citas de tratamiento el mismo día— sí depende del espacio
// elegido y se valida en "Confirmar y preparar", contra la relectura fresca de Citas.
const SRV_VALORACION = 'SRV-001';
const SRV_VALORACION_NINO = 'SRV-016';

const motor = $input.first().json;
const entrada = $('Normalizar entrada').first().json;
const datos = $('Preparar datos').first().json;

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const soloDigitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');
const telPaciente = soloDigitos(entrada.telefono);

const paciente = datos.pacientes.find((p) => soloDigitos(p.telefono) && soloDigitos(p.telefono) === telPaciente);
const oportunidad = datos.oportunidades.find((o) => soloDigitos(o.telefono) === telPaciente
  && !['Ganada', 'Perdida'].includes(txt(o.etapa)));

const esValoracion = [SRV_VALORACION, SRV_VALORACION_NINO].includes(motor.id_servicio);
if (!esValoracion && (!paciente || motor.requiere_valoracion)) {
  const razon = !paciente
    ? 'Como es su primera vez en la clínica, primero necesita una cita de valoración inicial'
    : `${motor.servicio} requiere una valoración previa`;
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
      mensaje: `${razon}. Dura 30 minutos, cuesta 15.000 colones e incluye el examen completo, `
        + 'el plan de tratamiento por escrito y las radiografías necesarias.'
        + (alternativas.length
          ? ` Le puedo ofrecer: ${alternativas.slice(0, 3).map((a) => a.texto).join('; ')}.`
          : ''),
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
  },
}];
