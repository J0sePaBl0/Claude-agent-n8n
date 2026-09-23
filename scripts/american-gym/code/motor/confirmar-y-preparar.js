// Última verificación antes de escribir: el espacio tiene que seguir libre.
// Google Sheets no da atomicidad, así que este re-chequeo es la única defensa contra
// una reserva duplicada. Suficiente para un demo; no para producción real.
const TZ = 'America/Costa_Rica';
// Reglas que dependen del tipo de cita. Apagadas en American Gym (2026-09-11). Ver
// "Calcular slots libres".
const REGLAS_POR_TIPO = false;
// `Reprogramada` también ocupa el espacio: en Dulce María faltaba y una cita movida dejaba
// su nuevo horario libre para otra persona.
const ESTADOS_QUE_OCUPAN = ['Solicitada', 'Confirmada', 'Reprogramada'];

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

const reglas = $('Validar reglas').first().json;
// Cuántas personas caben en este espacio. Viene de `Servicios.cupo` por "Calcular slots
// libres"; vacío = 1. Con cupo 1 esto se comporta igual que antes.
// Igual que en "Calcular slots libres": un 0 explícito es clase cerrada, no cita 1 a 1.
const cupoCrudo = parseInt(txt(datos.cupo), 10);
const cupo = Number.isNaN(cupoCrudo) ? 1 : Math.max(0, cupoCrudo);
const solapadas = citas.filter((c) => txt(c.id_entrenador) === slot.id_entrenador
  && txt(c.fecha) === slot.fecha
  && ESTADOS_QUE_OCUPAN.includes(txt(c.estado))
  && ini < aMin(c.hora_fin) && fin > aMin(c.hora_inicio));

// Alternativas para no devolver nunca un "no" pelado: el resto de la malla que ya se
// calculó, sin el espacio que acaba de fallar.
const otras = (datos.alternativas_todas || [])
  .filter((a) => !(a.fecha === slot.fecha && a.hora_inicio === slot.hora_inicio))
  .slice(0, 6);

// Inscribirse dos veces a la misma clase gastaría dos campos de los que quedan. El motor lo
// corta acá y no en "Validar reglas" porque necesita la relectura fresca de Citas: el
// cliente pudo haberse inscrito hace diez segundos, en este mismo turno.
const yaInscrito = reglas.id_cliente && solapadas.find((c) => txt(c.id_cliente) === txt(reglas.id_cliente)
  && txt(c.id_servicio) === txt(datos.id_servicio));
if (yaInscrito) {
  return [{
    json: {
      ok: false, sigue_libre: false, accion: 'agendar', motivo: 'ya_inscrito', disponible: false,
      interpretacion: datos.interpretacion, servicio: datos.servicio,
      nombre_registrado: datos.nombre_registrado || '', email_registrado: datos.email_registrado === true,
      mensaje: `Ya tiene reservado ${datos.servicio} ${datos.slot_texto}. No hace falta `
        + 'apartarlo otra vez.',
      alternativas: otras,
    },
  }];
}

if (solapadas.length >= cupo) {
  return [{
    json: {
      ok: false, sigue_libre: false, accion: 'agendar', motivo: 'no_coincide', disponible: false,
      interpretacion: datos.interpretacion, servicio: datos.servicio,
      nombre_registrado: datos.nombre_registrado || '', email_registrado: datos.email_registrado === true,
      mensaje: cupo > 1
        ? 'Esa clase se acaba de llenar. Le puedo ofrecer otro horario.'
        : 'Ese espacio se acaba de ocupar. Consulte la disponibilidad de nuevo para '
          + 'ofrecerle los horarios que quedan.',
      alternativas: otras,
    },
  }];
}

// Regla de Dulce María (solo con REGLAS_POR_TIPO): una persona no puede tener dos citas el
// mismo día. Se valida acá y no en "Validar reglas" porque depende del espacio elegido, y
// contra la relectura fresca de Citas para que cuente una cita que se acabe de crear.
const mismoDia = REGLAS_POR_TIPO && reglas.id_cliente
  && citas.find((c) => txt(c.id_cliente) === txt(reglas.id_cliente)
    && txt(c.fecha) === slot.fecha
    && ESTADOS_QUE_OCUPAN.includes(txt(c.estado)));
if (mismoDia) {
  const otroDia = (datos.alternativas_todas || []).filter((s) => s.fecha !== slot.fecha);
  return [{
    json: {
      ok: false, sigue_libre: false, accion: 'agendar', motivo: 'dos_citas_mismo_dia', disponible: false,
      interpretacion: datos.interpretacion, servicio: datos.servicio,
      nombre_registrado: datos.nombre_registrado || '', email_registrado: datos.email_registrado === true,
      mensaje: `Ya tiene una cita ese día a las ${txt(mismoDia.hora_inicio)}. `
        + 'El gimnasio no agenda dos citas el mismo día. '
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
const clientes = tablas.clientes;

// El calendario del entrenador que atiende. Va acá porque el nodo de Calendar está al
// final de la cadena y ahí $json ya es la respuesta del append de Actividades.
const entrenador = (tablas.entrenadores || []).find((p) => txt(p.id_entrenador) === slot.id_entrenador);
const idCalendar = entrenador ? txt(entrenador.id_calendar) : '';

const idCita = siguiente(citas.map((c) => c.id_cita), 'CITA-', 4);
const idCliente = datos.id_cliente || siguiente(clientes.map((p) => p.id_cliente), 'CLI-', 4);
const idActividad = siguiente(actividades.map((a) => a.id_actividad), 'ACT-', 5);
const ahora = DateTime.now().setZone(TZ);

// El correo del cliente para el aviso de la cita. Gana el que acaba de dar por WhatsApp
// sobre el que ya estaba en la hoja: si lo dictó de nuevo es porque el viejo no servía.
// Puede quedar vacío y no pasa nada: el correo es un aviso, nunca un requisito para
// agendar. `Fila cliente` lo escribe en Clientes!D para las próximas veces.
const emailCliente = txt(entrada.email) || txt((datos.cliente_row || {}).email);

// Datos de la sede para el correo. Salen de Config, que ya se leyó en "Preparar datos":
// el workflow de correos no vuelve a tocar Sheets.
const sede = (tablas.config || [])[0] || {};

return [{
  json: {
    ...datos,
    ok: true,
    sigue_libre: true,
    id_cita: idCita,
    id_cliente: idCliente,
    id_actividad: idActividad,
    id_calendar: idCalendar,
    // Costa Rica es UTC-6 todo el año (no hay horario de verano), así que el offset se
    // pone explícito en vez de confiar en cómo interprete n8n una fecha sin zona.
    inicio_iso: `${slot.fecha}T${slot.hora_inicio}:00-06:00`,
    fin_iso: `${slot.fecha}T${slot.hora_fin}:00-06:00`,
    fecha_creacion: ahora.toFormat('yyyy-MM-dd HH:mm'),
    // La precedencia real la aplica "Validar reglas" (dictado > hoja > perfil de WhatsApp) y
    // llega en `datos.nombre_cliente`; acá solo quedan las redes de seguridad.
    nombre_cliente: datos.nombre_cliente || txt(entrada.nombre_dictado)
      || txt(entrada.nombre_cliente) || 'Cliente WhatsApp',
    email_cliente: emailCliente,
    sede: {
      nombre: txt(sede.nombre),
      direccion: txt(sede.direccion),
      link_maps: txt(sede.link_maps),
      telefono: txt(sede.telefono),
      whatsapp: txt(sede.whatsapp),
    },
  },
}];
