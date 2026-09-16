// A cuál de los espacios libres se refería el cliente cuando dijo "dale, el de las 3".
// Se resuelve contra la disponibilidad RECALCULADA en este momento, no contra lo que se
// ofreció turnos atrás: así se detecta si el espacio se ocupó mientras conversaban.
const TZ = 'America/Costa_Rica';

const motor = $input.first().json;
const pedido = $('Interpretar la fecha').first().json;
const entrada = $('Normalizar entrada').first().json;

const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' };
const norm = (s) => String(s || '').toLowerCase().replace(/[áéíóúñ]/g, (c) => TILDES[c]);
const texto = norm(entrada.fecha_texto);

const aMin = (h) => {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
function enEspanol(s) {
  const d = DateTime.fromISO(s.fecha, { zone: TZ }).setLocale('es');
  const min = aMin(s.hora_inicio);
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const hora = h12 + ':' + String(min % 60).padStart(2, '0') + (h24 < 12 ? ' a. m.' : ' p. m.');
  // Clase vacía: anunciar "quedan 20 de 20" suena a que nadie va. Se dice el cupo y ya.
  const campos = s.cupo > 1
    ? (s.cupos_libres >= s.cupo ? ` (clase grupal, cupo para ${s.cupo})`
      : ` (quedan ${s.cupos_libres} de ${s.cupo} campos)`)
    : '';
  return `${d.toFormat("cccc d 'de' LLLL")}, ${hora}, con ${s.entrenador}${campos}`;
}
const publico = (s) => ({
  texto: enEspanol(s), fecha: s.fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin,
  id_entrenador: s.id_entrenador, entrenador: s.entrenador,
  cupo: s.cupo || 1, cupos_libres: s.cupos_libres === undefined ? 1 : s.cupos_libres,
});

const todos = motor.slots || [];
const fallar = (motivo, mensaje, opciones) => [{
  json: {
    ok: false, accion: 'agendar', motivo, mensaje,
    interpretacion: motor.interpretacion, servicio: motor.servicio, id_servicio: motor.id_servicio,
    disponible: false,
    alternativas: (opciones && opciones.length ? opciones : todos.slice(0, 6)).map(publico),
  },
}];

if (!todos.length) {
  return fallar('fuera_de_horario',
    `No tengo espacios de ${motor.servicio} en las próximas semanas.`, []);
}

// ---------- filtrar por lo que dijo ----------
let candidatos = todos;
if (pedido.dia_especifico) candidatos = candidatos.filter((s) => s.fecha === pedido.desde);
// `horas_posibles` trae dos horas cuando "a las 6" puede ser de mañana o de tarde: si las dos
// están libres, cae abajo en `ambiguo` y el agente pregunta cuál, sin elegir por el cliente.
const horas = pedido.horas_posibles || (pedido.hora_pretendida ? [pedido.hora_pretendida] : []);
if (horas.length) candidatos = candidatos.filter((s) => horas.includes(s.hora_inicio));
if (pedido.franja === 'manana') candidatos = candidatos.filter((s) => s.minuto_inicio < 12 * 60);
if (pedido.franja === 'tarde') candidatos = candidatos.filter((s) => s.minuto_inicio >= 12 * 60);

// Un entrenador por fecha+hora. Sin esto, un servicio que dan varios entrenadores
// se ofrecería como "08:00, 08:00, 08:30, 08:30".
const vistos = new Set();
candidatos = candidatos.filter((s) => {
  const clave = s.fecha + '|' + s.hora_inicio;
  if (vistos.has(clave)) return false;
  vistos.add(clave);
  return true;
});

// "el primero", "el segundo", "la tercera": posición sobre lo que se ofreció.
const ORDINALES = { primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4 };
const mOrdinal = Object.keys(ORDINALES).find((k) => new RegExp('\\b' + k + '\\b').test(texto));
if (mOrdinal && candidatos.length > 1) {
  const i = ORDINALES[mOrdinal] - 1;
  if (candidatos[i]) candidatos = [candidatos[i]];
}

if (!candidatos.length) {
  const cercanos = pedido.dia_especifico ? todos.filter((s) => s.fecha === pedido.desde) : [];
  return fallar('no_coincide',
    `Ese espacio ya no está disponible. Le puedo ofrecer ${enEspanol(todos[0])}.`,
    cercanos.length ? cercanos : todos.slice(0, 6));
}

// Varios candidatos a la misma hora y día pero con distinto entrenador no es ambigüedad
// para el cliente: se toma el primero. Ambiguo de verdad es "el jueves" con tres horas.
const distintos = new Set(candidatos.map((s) => s.fecha + ' ' + s.hora_inicio));
if (distintos.size > 1) {
  // Repartidas a lo largo del día, NO las 4 primeras. Con 18 espacios libres las 4 primeras
  // son todas de la mañana, así que el espacio de la tarde que el cliente venía pidiendo
  // desaparecía de la lista y el modelo lo leía como "ya no está disponible" (2026-08-07).
  const n = Math.min(5, candidatos.length);
  const paso = (candidatos.length - 1) / (n - 1);
  const muestra = candidatos.length <= n
    ? candidatos
    : Array.from({ length: n }, (_, i) => candidatos[Math.round(i * paso)]);
  return fallar('ambiguo',
    `Ese día tengo ${candidatos.length} espacios libres, por ejemplo: `
    + `${muestra.map((s) => s.hora_inicio).join(', ')}. ¿A qué hora le sirve?`,
    muestra);
}

const elegido = candidatos[0];
const { slots, ...resto } = motor;   // slots es grande y ya no hace falta aguas abajo
return [{
  json: {
    ...resto,                        // arrastra los datos del cliente que puso "Validar reglas"
    ok: true, accion: 'agendar',
    slot: elegido, slot_texto: enEspanol(elegido),
    alternativas: [publico(elegido)],
    // por si "Confirmar y preparar" tiene que ofrecer otro día
    alternativas_todas: todos.slice(0, 40).map(publico),
  },
}];
