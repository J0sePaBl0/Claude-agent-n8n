// Última verificación antes de escribir: el espacio tiene que seguir libre.
// Google Sheets no da atomicidad, así que este re-chequeo es la única defensa contra
// una reserva duplicada. Suficiente para un demo; no para producción real.
const TZ = 'America/Costa_Rica';

const datos = $('Resolver slot pedido').first().json;
const entrada = $('Normalizar entrada').first().json;
const citas = $input.first().json.citas;   // viene de "Preparar citas frescas"

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
const aMin = (h) => {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

const slot = datos.slot;
const ini = aMin(slot.hora_inicio);
const fin = aMin(slot.hora_fin);

const chocando = citas.find((c) => txt(c.id_profesional) === slot.id_profesional
  && txt(c.fecha) === slot.fecha
  && ['Solicitada', 'Confirmada'].includes(txt(c.estado))
  && ini < aMin(c.hora_fin) && fin > aMin(c.hora_inicio));

if (chocando) {
  return [{
    json: {
      ok: false, sigue_libre: false, accion: 'agendar', motivo: 'no_coincide', disponible: false,
      interpretacion: datos.interpretacion, servicio: datos.servicio,
      mensaje: 'Ese espacio se acaba de ocupar. Consulte la disponibilidad de nuevo para '
        + 'ofrecerle los horarios que quedan.',
      alternativas: [],
    },
  }];
}

// DM_03: un paciente no puede tener dos citas de tratamiento el mismo día. Se valida acá
// y no en "Validar reglas" porque depende del espacio elegido, y contra la relectura
// fresca de Citas para que cuente una cita que se acabe de crear.
const reglas = $('Validar reglas').first().json;
const mismoDia = reglas.id_paciente && citas.find((c) => txt(c.id_paciente) === txt(reglas.id_paciente)
  && txt(c.fecha) === slot.fecha
  && ['Solicitada', 'Confirmada'].includes(txt(c.estado)));
if (mismoDia) {
  const otroDia = (datos.alternativas_todas || []).filter((s) => s.fecha !== slot.fecha);
  return [{
    json: {
      ok: false, sigue_libre: false, accion: 'agendar', motivo: 'dos_citas_mismo_dia', disponible: false,
      interpretacion: datos.interpretacion, servicio: datos.servicio,
      mensaje: `Ya tiene una cita ese día a las ${txt(mismoDia.hora_inicio)}. `
        + 'La clínica no agenda dos tratamientos el mismo día. '
        + (otroDia.length ? `Le puedo ofrecer ${otroDia[0].texto}.` : ''),
      alternativas: otroDia.slice(0, 6),
    },
  }];
}

// ---------- ids nuevos ----------
const siguiente = (lista, prefijo, ancho) => {
  const nums = lista.map((v) => parseInt(txt(v).replace(prefijo, ''), 10)).filter((n) => !isNaN(n));
  return prefijo + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(ancho, '0');
};
const tablas = $('Preparar datos').first().json;
const actividades = tablas.actividades;
const pacientes = tablas.pacientes;

// El calendario del profesional que atiende. Va acá porque el nodo de Calendar está al
// final de la cadena y ahí $json ya es la respuesta del append de Actividades.
const profesional = (tablas.profesionales || []).find((p) => txt(p.id_profesional) === slot.id_profesional);
const idCalendar = profesional ? txt(profesional.id_calendar) : '';

const idCita = siguiente(citas.map((c) => c.id_cita), 'CITA-', 4);
const idPaciente = datos.id_paciente || siguiente(pacientes.map((p) => p.id_paciente), 'PAC-', 4);
const idActividad = siguiente(actividades.map((a) => a.id_actividad), 'ACT-', 5);
const ahora = DateTime.now().setZone(TZ);

return [{
  json: {
    ...datos,
    ok: true,
    sigue_libre: true,
    id_cita: idCita,
    id_paciente: idPaciente,
    id_actividad: idActividad,
    id_calendar: idCalendar,
    // Costa Rica es UTC-6 todo el año (no hay horario de verano), así que el offset se
    // pone explícito en vez de confiar en cómo interprete n8n una fecha sin zona.
    inicio_iso: `${slot.fecha}T${slot.hora_inicio}:00-06:00`,
    fin_iso: `${slot.fecha}T${slot.hora_fin}:00-06:00`,
    fecha_creacion: ahora.toFormat('yyyy-MM-dd HH:mm'),
    nombre_paciente: datos.nombre_paciente || txt(entrada.nombre_paciente) || 'Paciente WhatsApp',
  },
}];
