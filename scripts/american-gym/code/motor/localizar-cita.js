// De qué cita habla el cliente. Es la puerta de entrada de confirmar, cancelar y reagendar,
// y además decide con qué servicio calcula espacios el motor cuando se reagenda.
//
// Dos vías de entrada, a propósito:
//   · con `token`  → viene de un enlace del correo e identifica una cita concreta.
//   · sin `token`  → viene del agente por WhatsApp y se resuelve por teléfono.
//
// Ninguna de las dos le pide `id_cita` al modelo: cada dato que el modelo no tiene que
// llenar es un dato que no puede inventar. Mismo criterio que con `id_oportunidad`.
//
// Para consultar y agendar NO localiza una cita, pero sí arma el CONTEXTO del cliente:
// si ya es conocido, en qué estado está su valoración inicial y qué citas tiene por
// delante. Ese contexto es lo que faltaba. Sin él (2026-08-28, exec 27517) el modelo
// deducía si hacía falta valoración leyendo la columna `requiere_valoracion` del
// servicio —que habla del SERVICIO, no de la persona— y le prometía a un cliente cosas
// que "agendar" después rechazaba. Los datos ya están en memoria: no cuesta ni una
// lectura más de Sheets.
const GESTION = ['confirmar', 'cancelar', 'reagendar'];
const ACTIVAS = ['Solicitada', 'Confirmada', 'Reprogramada'];
const VALORACIONES = ['SRV-001', 'SRV-016'];
const TZ = 'America/Costa_Rica';

// Va DESPUÉS de "Interpretar la fecha" para poder desambiguar "la del jueves" reusando el
// resolver, así que los datos del CRM se piden por nombre y no por $input.
const datos = $('Preparar datos').first().json;
const entrada = $('Normalizar entrada').first().json;
const pedido = $('Interpretar la fecha').first().json;
const accion = String(entrada.accion || '').trim();

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const digitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');

const hoy = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');

const enEspanol = (c) => {
  const d = DateTime.fromISO(txt(c.fecha), { zone: TZ }).setLocale('es');
  const [hh, mm] = txt(c.hora_inicio).split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${d.toFormat("cccc d 'de' LLLL")}, ${h12}:${String(mm).padStart(2, '0')}`
    + `${hh < 12 ? ' a. m.' : ' p. m.'}`;
};
const publico = (c) => ({
  texto: enEspanol(c), fecha: txt(c.fecha), hora_inicio: txt(c.hora_inicio),
  hora_fin: txt(c.hora_fin), id_entrenador: txt(c.id_entrenador), id_cita: txt(c.id_cita),
});
const porFechaHora = (a, b) => (txt(a.fecha) + txt(a.hora_inicio))
  .localeCompare(txt(b.fecha) + txt(b.hora_inicio));

const nombreServicio = (id) => {
  const s = datos.servicios.find((x) => txt(x.id_servicio) === txt(id));
  return s ? txt(s.nombre) : txt(id);
};
// Las citas que se le recuerdan al cliente llevan el nombre del servicio: "su limpieza
// del sábado" le sirve; "su CITA-0031" no le dice nada a nadie.
const citaPublica = (c) => ({
  texto: enEspanol(c), fecha: txt(c.fecha), hora_inicio: txt(c.hora_inicio),
  id_cita: txt(c.id_cita), estado: txt(c.estado), servicio: nombreServicio(c.id_servicio),
});

// Palabras que no identifican una cita: "quiero mover la cita de la clase para mañana".
const RELLENO = new Set(['cita', 'citas', 'clase', 'clases', 'para', 'esta', 'esa', 'ese', 'del', 'las',
  'los', 'una', 'mis', 'con', 'por', 'que', 'quiero', 'mover', 'muevame', 'cambiar', 'cambieme',
  'reagendar', 'pasar', 'pasela', 'pase', 'hora', 'dia', 'mismo', 'misma', 'otra', 'tarde', 'manana',
  'noche']);
const sinTildes = (s) => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Se queda con las citas que mejor calzan con lo que dijo el cliente (servicio o día). Si no
// reconoce nada, o empatan, devuelve la lista entera y el motor repregunta: nunca elige a
// ciegas.
function filtrarPorLoDicho(lista, dicho) {
  const palabras = sinTildes(dicho).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !RELLENO.has(p));
  if (!palabras.length) return lista;
  const puntuadas = lista.map((c) => {
    const pajar = sinTildes(`${nombreServicio(c.id_servicio)} ${enEspanol(c)} ${txt(c.fecha)} ${txt(c.id_cita)}`);
    return { c, n: palabras.filter((p) => pajar.includes(p)).length };
  });
  const mejor = Math.max(...puntuadas.map((p) => p.n));
  return mejor === 0 ? lista : puntuadas.filter((p) => p.n === mejor).map((p) => p.c);
}

const buscarCliente = (tel) => (tel
  ? datos.clientes.find((p) => digitos(p.telefono) && digitos(p.telefono) === tel) || null
  : null);

// Contexto del cliente, idéntico para todas las acciones. Es lo que le permite al motor
// explicar POR QUÉ deja o no deja agendar, en vez de dejar que el modelo lo adivine.
function contexto(pac) {
  if (!pac) {
    return {
      cliente_existente: false,
      // Nadie con ese teléfono en Clientes: el agente todavía no sabe cómo se llama y
      // tiene que pedírselo junto con el correo antes de agendar.
      nombre_registrado: '',
      email_registrado: false,
      valoracion: { estado: 'ninguna', texto: '' },
      citas_proximas: [],
    };
  }
  const mias = datos.citas.filter((c) => txt(c.id_cliente) === txt(pac.id_cliente));
  const proximas = mias
    .filter((c) => ACTIVAS.includes(txt(c.estado)) && txt(c.fecha) >= hoy)
    .sort(porFechaHora);

  // Solo una valoración YA ATENDIDA levanta la regla del servicio. Una agendada a futuro
  // todavía no, y la diferencia importa porque el mensaje cambia: "usted ya fue valorado"
  // no es lo mismo que "su valoración es el jueves, el tratamiento va después de esa".
  const vals = mias.filter((c) => VALORACIONES.includes(txt(c.id_servicio)));
  const realizada = vals.find((c) => txt(c.estado) === 'Completada'
    || (ACTIVAS.includes(txt(c.estado)) && txt(c.fecha) < hoy));
  const agendada = vals
    .filter((c) => ACTIVAS.includes(txt(c.estado)) && txt(c.fecha) >= hoy)
    .sort(porFechaHora)[0];

  return {
    cliente_existente: true,
    // El nombre REAL, el que el cliente dictó cuando se registró. Es lo que el agente usa
    // para tratarlo por su nombre: el del perfil de WhatsApp no sirve (es un apodo, o el
    // nombre de quien prestó el teléfono). `email_registrado` es un sí/no a propósito:
    // al modelo le alcanza con saber que no hace falta volver a pedirlo.
    nombre_registrado: txt(pac.nombre_completo),
    email_registrado: !!txt(pac.email),
    valoracion: {
      estado: realizada ? 'realizada' : (agendada ? 'agendada' : 'ninguna'),
      texto: realizada ? enEspanol(realizada) : (agendada ? enEspanol(agendada) : ''),
    },
    citas_proximas: proximas.map(citaPublica),
  };
}

// "¿Qué citas tengo?" — acción de SOLO LECTURA, sin efectos.
//
// Existe porque no había ninguna: para contestar eso el modelo tenía que llamar a una
// herramienta de gestión (que confirma o cancela de verdad) o contestar de memoria. En las
// pruebas del 2026-09-16 hizo lo segundo y acertó de casualidad, porque acababa de agendar
// en esa misma conversación; en una conversación nueva habría recitado algo viejo.
//
// Sale por la rama `ok:false` de "¿Cita localizada?" directo a "Respuesta". Es el único
// camino que no pasa por el cálculo de espacios, que exigiría un `id_servicio` que acá no
// hay. `ok:false` no significa error: el `mensaje` viene redactado y `motivo` dice cuál es.
if (accion === 'consultar_citas') {
  const pac = buscarCliente(digitos(entrada.telefono));
  const ctx = contexto(pac);
  const proximas = ctx.citas_proximas;
  const mensaje = !proximas.length
    ? 'No tiene citas próximas agendadas. ¿Quiere que le busque un espacio?'
    // El `texto` ya termina en punto ("6:00 a. m."), así que el estado va entre paréntesis y
    // no con otra frase detrás: si no, queda "6:00 a. m.. Está como solicitada".
    : (proximas.length === 1
      ? `Tiene una cita: ${proximas[0].servicio}, ${proximas[0].texto} `
        + `(${txt(proximas[0].estado).toLowerCase()}).`
      : `Tiene ${proximas.length} citas próximas: `
        + `${proximas.map((c) => `${c.servicio}, ${c.texto} (${txt(c.estado).toLowerCase()})`).join('; ')}.`);
  return [{
    json: {
      ok: false,
      accion,
      motivo: proximas.length ? 'listado' : 'sin_citas',
      mensaje,
      disponible: false,
      alternativas: [],
      cita: null,
      ...ctx,
    },
  }];
}

// Consultar y agendar no localizan una cita: siguen de largo con el servicio que pidió el
// modelo, pero llevándose el contexto del cliente.
if (!GESTION.includes(accion)) {
  const pac = buscarCliente(digitos(entrada.telefono));
  return [{
    json: {
      ok: true,
      accion,
      id_servicio: txt(entrada.id_servicio),
      cita: null,
      cliente: pac ? { ...pac, fila: pac.row_number } : null,
      ...contexto(pac),
    },
  }];
}

// El contexto viaja también en los fallos: "no encuentro ninguna cita a su nombre" no puede
// hacer que el agente se olvide de cómo se llama el cliente. `cliente` se resuelve al
// llamar, no al definir.
const fallar = (motivo, mensaje, opciones = []) => [{
  json: {
    ok: false, accion, motivo, mensaje, disponible: false, alternativas: opciones, cita: null,
    ...contexto(cliente),
  },
}];

const token = txt(entrada.token);
let cita = null;
let cliente = null;

if (token) {
  cita = datos.citas.find((c) => txt(c.token_gestion) === token) || null;
  if (!cita) {
    return fallar('token_invalido',
      'Este enlace ya no es válido. Escríbanos por WhatsApp y le ayudamos con su cita.');
  }
  if (!ACTIVAS.includes(txt(cita.estado))) {
    return fallar('cita_no_activa',
      `Esa cita figura como ${txt(cita.estado).toLowerCase()}, así que no hay nada pendiente por hacer.`);
  }
  cliente = datos.clientes.find((p) => txt(p.id_cliente) === txt(cita.id_cliente)) || null;
} else {
  cliente = buscarCliente(digitos(entrada.telefono));
  if (!cliente) {
    return fallar('sin_citas',
      'No encuentro ninguna cita a su nombre. ¿Quiere que le busque un espacio?');
  }

  let suyas = datos.citas
    .filter((c) => txt(c.id_cliente) === txt(cliente.id_cliente)
      && ACTIVAS.includes(txt(c.estado)) && txt(c.fecha) >= hoy)
    .sort(porFechaHora);

  if (!suyas.length) {
    return fallar('sin_citas',
      'No tiene citas próximas agendadas. ¿Quiere que le busque un espacio?');
  }

  if (suyas.length > 1 && accion === 'reagendar') {
    // En `reagendar`, `fecha_texto` es el DESTINO ("el jueves a las 6"), no la cita de origen:
    // filtrar por ese día movía la cita equivocada cuando el destino coincidía con el día de
    // OTRA cita (2026-09-16, caso 7.3 del retest) y no encontraba nada cuando no coincidía.
    // La cita de origen llega aparte, en `cita_a_mover`, con las palabras del cliente
    // ("la de Full Body", "la del martes"); se compara contra el servicio y el día de cada una.
    suyas = filtrarPorLoDicho(suyas, entrada.cita_a_mover);
  } else if (suyas.length > 1 && pedido.dia_especifico) {
    // Si el cliente dijo de cuál habla ("la del jueves"), se filtra por lo que entendió el
    // resolver de fechas. Reusa esa pieza en vez de repetir un mini-parser acá.
    const delDia = suyas.filter((c) => txt(c.fecha) === pedido.desde);
    if (delDia.length) suyas = delDia;
  }

  // Se devuelven TODAS, no las primeras N. Una lista cortada hace que el modelo afirme que
  // algo no existe: es el bug del 2026-08-07 con otro disfraz.
  if (suyas.length > 1) {
    const cuál = suyas.length === 2 ? '¿Cuál de las dos?' : '¿Cuál de ellas?';
    // Motivo DISTINTO al 'ambiguo' que devuelve "Resolver slot pedido": ese es sobre qué
    // HORARIO del día, este es sobre qué CITA existente. Comparten nombre genérico antes
    // (2026-09-16) y el modelo confundía las dos instrucciones: al ver 'ambiguo' aplicaba
    // la regla de reagendar ("si ya dio la hora, reintentá") en vez de preguntar cuál cita
    // era, y terminaba moviendo la que no era.
    return fallar('ambiguo_cual_cita',
      `Tiene ${suyas.length} citas próximas: ${suyas.map(enEspanol).join('; ')}. ${cuál}`,
      suyas.map(publico));
  }
  cita = suyas[0];
}

const servicio = datos.servicios.find((s) => txt(s.id_servicio) === txt(cita.id_servicio));
const entrenador = datos.entrenadores.find((p) => txt(p.id_entrenador) === txt(cita.id_entrenador));

return [{
  json: {
    ok: true,
    accion,
    // Al reagendar, el servicio sale de la CITA, no de lo que diga el modelo: se mueve la
    // misma cita, no se inventa otra. "Calcular slots libres" lee este campo.
    id_servicio: txt(cita.id_servicio),
    cita: {
      ...cita,
      fila: cita.row_number,
      texto: enEspanol(cita),
      servicio: servicio ? txt(servicio.nombre) : txt(cita.id_servicio),
      duracion_min: servicio ? (parseInt(txt(servicio.duracion_min), 10) || 30) : 30,
      entrenador: entrenador ? txt(entrenador.nombre) : txt(cita.id_entrenador),
      id_calendar: entrenador ? txt(entrenador.id_calendar) : '',
    },
    cliente: cliente ? { ...cliente, fila: cliente.row_number } : null,
    ...contexto(cliente),
  },
}];
