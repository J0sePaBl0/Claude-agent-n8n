// Carga Config, Entrenadores y Servicios de American Gym en el Sheet `CRM - American Gym`.
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/cargar-catalogo.mjs [--apply]
//
// Sin --apply solo muestra lo que haría. La fuente de verdad es ESTE archivo: la hoja se
// sobrescribe entera cada vez, así que editar a mano en Google se pierde en la próxima corrida.
//
// De dónde sale cada cosa (información que el gimnasio pasó el 2026-09-16):
//   · Config          → ubicación, WhatsApp y horarios de funcionamiento de American Gym.
//   · Entrenadores    → el cuadro "HORARIO DE SERVICIO EN PLANTA" + los instructores de clases.
//   · Servicios       → el cronograma "American Experiences" + Pilates Reformer + Jungle Box.
//
// PRECIOS INVENTADOS. El gimnasio todavía no los pasó (pendiente explícito del usuario,
// 2026-09-16). Son de referencia para que el demo pueda cotizar; hay que reemplazarlos por los
// reales antes de enseñárselo a nadie de afuera. Ver cambios/american-gym/pendientes.md.
import { SID, batchUpdate, call } from '../agenda/sheets.mjs';

const SID_GYM = '1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY';
if (SID !== SID_GYM) throw new Error(`Abortado: SID=${SID} no es el de American Gym. Corré con TENANT=american-gym.`);
const APLICAR = process.argv.includes('--apply');

// ---------------------------------------------------------------- Config
// El último espacio del día termina UNA HORA antes del cierre (MINUTOS_ANTES_DEL_CIERRE en
// "Calcular slots libres"), así que con cierre 21:00 la última cita entre semana arranca 20:00.
const CONFIG = [[
  'SEDE-01',
  'American Gym',
  '600 m sureste del Más x Menos, Rincón de Ricardo, San Pablo, Heredia',
  '9.9841875',
  '-84.1017914',
  'https://www.google.com/maps/place/American+Gym/@9.9841875,-84.1017914,17z',
  '+506 7254-7861',
  'Lun-Vie 05:00-21:00, Sáb 07:00-15:00, Dom 09:00-13:00',
  '+506 7254-7861',
]];

// ---------------------------------------------------------------- Entrenadores
// id_entrenador, nombre, especialidad, sede, dias_atencion, horario, duracion_slot_min, activo, id_calendar
//
// Dos familias de filas:
//   ENT-*  personas de planta. Se agendan 1 a 1 y su ventana sale del cuadro de turnos.
//   CLS-*  filas DEDICADAS a una clase. No son el turno de nadie: son el espacio de la clase,
//          con el nombre del instructor para que el cliente lea "con Ana Barboza". Están
//          separadas a propósito: si una clase colgara del entrenador de planta, las
//          inscripciones le taparían su agenda 1 a 1 (y al revés).
//
// El motor admite UNA ventana continua por día. Ninguna persona del cuadro tiene turno partido
// dentro del mismo día, así que el formato `Día:rango;Día:rango` alcanza. Las clases que sí se
// parten (Virtual Cycling viernes 7 a. m. y 7 p. m.) van en DOS filas CLS-*.
const ENTRENADORES = [
  ['ENT-001', 'Mario Cruz Rojas', 'Entrenamiento de planta', 'SEDE-01', 'lun;mar;mie;jue;vie;dom',
    'Lun:05:00-09:00;Mar:05:00-08:00;Mie:05:00-08:00;Jue:05:00-08:00;Vie:05:00-08:00;Dom:09:00-13:00', '60', 'TRUE', ''],
  ['ENT-002', 'Andrés Hernández Sáenz', 'Entrenamiento de planta', 'SEDE-01', 'lun;mar;jue;vie',
    'Lun:09:00-13:00;Mar:08:00-13:00;Jue:08:00-13:00;Vie:08:00-11:00', '60', 'TRUE', ''],
  ['ENT-003', 'Julia Acuña', 'Entrenamiento de planta y box', 'SEDE-01', 'mie',
    'Mie:08:00-13:00', '60', 'TRUE', ''],
  ['ENT-004', 'Norman Arguedas Abarca', 'Entrenamiento de planta', 'SEDE-01', 'lun;mar;mie;jue;vie',
    'Lun:13:00-21:00;Mar:13:00-21:00;Mie:13:00-21:00;Jue:13:00-21:00;Vie:11:00-17:00', '60', 'TRUE', ''],
  ['ENT-005', 'Marco Rojas Guzmán', 'Entrenamiento de planta', 'SEDE-01', 'mie;sab',
    'Mie:17:00-21:00;Sab:07:00-13:00', '60', 'TRUE', ''],
  // PENDIENTE: "MACHO" en el cuadro de turnos. Es el único nombre de la lista que queda sin
  // asignar, pero el gimnasio no lo confirmó. Si no es él, se corrige acá.
  ['ENT-006', 'Luis Madrigal Molina', 'Entrenamiento de planta', 'SEDE-01', 'mar;jue;vie;sab;dom',
    'Mar:17:00-21:00;Jue:17:00-21:00;Vie:17:00-21:00;Sab:09:00-15:00;Dom:09:00-13:00', '60', 'TRUE', ''],
  ['ENT-007', 'Roy Smith Lewis', 'Entrenamiento de planta', 'SEDE-01', 'lun',
    'Lun:17:00-21:00', '60', 'TRUE', ''],
  ['ENT-008', 'Johnathan Robles Navarro', 'Entrenamiento de planta', 'SEDE-01', 'vie',
    'Vie:17:00-21:00', '60', 'TRUE', ''],
  // Head Coach de planta. No aparece en el cuadro de turnos, así que no tiene ventana que
  // ofrecer: queda inactiva para que el motor no la elija. Sí se la nombra en el RAG.
  ['ENT-009', 'Nicole Arguedas Carranza', 'Head Coach de planta', 'SEDE-01', '', '', '60', 'FALSE', ''],

  ['CLS-PIL-AM', 'Bruna Braga', 'Pilates Reformer', 'SEDE-01', 'lun;mar;mie;jue;vie', '06:00-09:00', '60', 'TRUE', ''],
  ['CLS-PIL-PM', 'Natalie Araya Briones', 'Pilates Reformer', 'SEDE-01', 'lun;mar;mie;jue;vie', '17:00-19:00', '60', 'TRUE', ''],
  ['CLS-BOX-AM', 'Hernán Araneda Spinelli', 'American Jungle Box', 'SEDE-01', 'lun;mar;mie;jue;vie', '06:00-09:00', '60', 'TRUE', ''],
  ['CLS-BOX-PM', 'Andrei Quesada Santamaría', 'American Jungle Box', 'SEDE-01', 'lun;mar;mie;jue;vie', '17:00-20:00', '60', 'TRUE', ''],
  ['CLS-BOX-SAB', 'Julia Acuña', 'American Jungle Box', 'SEDE-01', 'sab', 'Sab:09:00-11:00', '60', 'TRUE', ''],
  ['CLS-PILEXP', 'Patricia Arias Cordero', 'Pilates Animal', 'SEDE-01', 'lun', 'Lun:17:00-18:00', '60', 'TRUE', ''],
  ['CLS-FULLBODY', 'Jason Castro Murillo', 'Full Body', 'SEDE-01', 'mar', 'Mar:17:00-19:00', '60', 'TRUE', ''],
  ['CLS-YOGA', 'Ana Barboza', 'Yoga', 'SEDE-01', 'mie', 'Mie:18:00-19:00', '60', 'TRUE', ''],
  ['CLS-DANCE', 'Omar Guzmán Castro', 'American Dance', 'SEDE-01', 'mie;sab', 'Mie:19:00-20:00;Sab:10:00-11:00', '60', 'TRUE', ''],
  ['CLS-GLUTEOS', 'Natalie Araya Briones', 'Glúteos y piernas', 'SEDE-01', 'jue', 'Jue:17:00-19:00', '60', 'TRUE', ''],
  // El cronograma no nombra instructor para Virtual Cycling ni para GAP.
  ['CLS-CYCLING-AM', 'el coach de turno', 'Virtual Cycling', 'SEDE-01', 'vie', 'Vie:07:00-08:00', '60', 'TRUE', ''],
  ['CLS-CYCLING-PM', 'el coach de turno', 'Virtual Cycling', 'SEDE-01', 'vie', 'Vie:19:00-20:00', '60', 'TRUE', ''],
  ['CLS-MILITARY', 'Juan Carlos Meneses Rojas', 'Military Experience', 'SEDE-01', 'sab', 'Sab:08:00-09:00', '60', 'TRUE', ''],
  ['CLS-GAP', 'el coach de turno', 'GAP', 'SEDE-01', 'sab', 'Sab:09:00-10:00', '60', 'TRUE', ''],
];

// ---------------------------------------------------------------- Servicios
// id_servicio, nombre, categoria, descripcion, duracion_min, precio_desde, precio_hasta,
// moneda, num_sesiones, entrenadores_habilitados, activo, cupo
//
// `cupo` es la columna NUEVA (L): cuántas personas caben en el mismo espacio. Vacío o 1 = cita
// 1 a 1 de siempre. Mayor que 1 = clase grupal, y el espacio se cierra recién al llenarse.
// Solo se le pone cupo > 1 a un servicio cuyos habilitados son filas CLS-*.
//
// Las filas de categoría "Membresía" NO se agendan (no tienen entrenadores): existen para que
// `catalogo_servicios` pueda cotizarlas. El prompt del agente lo dice explícitamente.
const PLANTA = 'ENT-001;ENT-002;ENT-003;ENT-004;ENT-005;ENT-006;ENT-007;ENT-008';
const SERVICIOS = [
  ['SRV-001', 'Valoración física inicial', 'Valoración',
    'Primera cita con un entrenador para medir su condición física, conversar sus objetivos y armar su plan. Está incluida con las membresías del gimnasio, sin costo adicional.',
    '30', '0', '0', 'CRC', '1', PLANTA, 'TRUE', '1'],
  ['SRV-003', 'Rutina personalizada', 'Entrenamiento personal',
    'Cita para armar o actualizar su rutina de entrenamiento con un entrenador. Precio POR SESIÓN.',
    '45', '9000', '9000', 'CRC', '1', PLANTA, 'TRUE', '1'],

  ['SRV-010', 'Pilates Reformer (American Pilates)', 'Clase grupal',
    'Clase en máquina reformer para fuerza, movilidad y postura. Cupo limitado por la cantidad de máquinas.',
    '60', '', '', 'CRC', '1', 'CLS-PIL-AM;CLS-PIL-PM', 'TRUE', '6'],
  ['SRV-011', 'American Jungle Box (WOD / HIIT)', 'Clase grupal',
    'Entrenamiento funcional de alta intensidad en el box.',
    '60', '', '', 'CRC', '1', 'CLS-BOX-AM;CLS-BOX-PM;CLS-BOX-SAB', 'TRUE', '15'],

  ['SRV-020', 'Pilates Experience (Pilates Animal)', 'Clase grupal',
    'Clase de American Experiences.',
    '60', '', '', 'CRC', '1', 'CLS-PILEXP', 'TRUE', '15'],
  ['SRV-021', 'Full Body', 'Clase grupal',
    'Clase de American Experiences, trabajo de cuerpo completo.',
    '60', '', '', 'CRC', '1', 'CLS-FULLBODY', 'TRUE', '20'],
  ['SRV-022', 'Yoga Experience', 'Clase grupal',
    'Clase de American Experiences, enfocada en movilidad, respiración y recuperación.',
    '60', '', '', 'CRC', '1', 'CLS-YOGA', 'TRUE', '20'],
  ['SRV-023', 'American Dance', 'Clase grupal',
    'Clase de American Experiences, baile y cardio.',
    '60', '', '', 'CRC', '1', 'CLS-DANCE', 'TRUE', '25'],
  ['SRV-024', 'Glúteos y Piernas', 'Clase grupal',
    'Clase de American Experiences, tren inferior.',
    '60', '', '', 'CRC', '1', 'CLS-GLUTEOS', 'TRUE', '20'],
  ['SRV-025', 'Virtual Cycling', 'Clase grupal',
    'Clase de American Experiences, ciclismo indoor con ruta proyectada.',
    '60', '', '', 'CRC', '1', 'CLS-CYCLING-AM;CLS-CYCLING-PM', 'TRUE', '12'],
  ['SRV-026', 'Military Experience', 'Clase grupal',
    'Clase de American Experiences, entrenamiento de alta exigencia estilo militar.',
    '60', '', '', 'CRC', '1', 'CLS-MILITARY', 'TRUE', '20'],
  ['SRV-027', 'GAP (glúteos, abdomen y piernas)', 'Clase grupal',
    'Clase de American Experiences.',
    '60', '', '', 'CRC', '1', 'CLS-GAP', 'TRUE', '20'],

  ['SRV-100', 'Membresía Individual', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Precio POR MES.',
    '0', '31000', '31000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-101', 'Membresía Estudiantil', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Para estudiantes. Precio POR MES.',
    '0', '26000', '26000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-102', 'Membresía Parejas', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Para dos personas que se inscriben juntas. Precio POR MES, por la pareja completa.',
    '0', '56000', '56000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-103', 'Membresía Plan +3', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Plan grupal de 3 personas. Precio POR MES, por el grupo completo.',
    '0', '68000', '68000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-104', 'Membresía Plan +4', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Plan grupal de 4 personas. Precio POR MES, por el grupo completo.',
    '0', '104000', '104000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-105', 'Membresía Plan +5', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Plan grupal de 5 personas. Precio POR MES, por el grupo completo.',
    '0', '130000', '130000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-106', 'Membresía Plan de 9 a. m. a 3 p. m.', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Solo se puede entrenar de 9:00 a. m. a 3:00 p. m. Precio POR MES.',
    '0', '17000', '17000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-107', 'Membresía Plan D (5 a. m. a 11 a. m. / mediodía)', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Horario de 5:00 a. m. a 11:00 a. m. Precio POR MES.',
    '0', '23000', '23000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-108', 'Membresía Plan de Mediodía', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Precio POR MES.',
    '0', '25000', '25000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-110', 'Membresía Adulto Mayor', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Para mayores de 65 años. Precio POR 12 MESES.',
    '0', '265000', '265000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-111', 'Membresía Semanal', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Precio POR SEMANA.',
    '0', '13000', '13000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-112', 'Membresía Trimestral', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Precio POR TRIMESTRE (tres meses).',
    '0', '78000', '78000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-113', 'Membresía Semestral', 'Membresía',
    'Membresía de American Gym, incluye el uso regular del gimnasio. Precio POR SEMESTRE (seis meses).',
    '0', '146000', '146000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-114', 'Sesión (pase por un día)', 'Membresía',
    'Acceso al gimnasio por un día, sin membresía. Precio POR DÍA.',
    '0', '5000', '5000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-115', 'Plan Nutricional', 'Membresía',
    'Plan de nutrición. Precio POR MES.',
    '0', '55997', '55997', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-116', 'Box Individual', 'Membresía',
    'Membresía de American Jungle Box. Precio POR MES.',
    '0', '38000', '38000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-117', 'Box Estudiantil', 'Membresía',
    'Membresía de American Jungle Box. Para estudiantes. Precio POR MES.',
    '0', '31000', '31000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-118', 'Box Pareja', 'Membresía',
    'Membresía de American Jungle Box. Para dos personas que se inscriben juntas. Precio POR MES, por la pareja completa.',
    '0', '72000', '72000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-119', 'Box +3', 'Membresía',
    'Membresía de American Jungle Box. Plan grupal de 3 personas. Precio POR MES, por el grupo completo.',
    '0', '102000', '102000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-120', 'Box Grupo +4', 'Membresía',
    'Membresía de American Jungle Box. Plan grupal de 4 personas. Precio POR MES, por el grupo completo.',
    '0', '136000', '136000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-121', 'Box Semanal', 'Membresía',
    'Membresía de American Jungle Box. Precio POR SEMANA.',
    '0', '31000', '31000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-122', 'Box Trimestral', 'Membresía',
    'Membresía de American Jungle Box. Precio POR TRIMESTRE (tres meses).',
    '0', '100000', '100000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-123', 'Box Anual', 'Membresía',
    'Membresía de American Jungle Box. Precio POR AÑO.',
    '0', '312000', '312000', 'CRC', '1', '', 'TRUE', '1'],
  ['SRV-124', 'Box + Nutrición Semestral', 'Membresía',
    'Membresía de American Jungle Box. Incluye nutrición. Precio POR SEMESTRE (seis meses).',
    '0', '330000', '330000', 'CRC', '1', '', 'TRUE', '1'],
];

const CAB_SERVICIOS = ['id_servicio', 'nombre', 'categoria', 'descripcion', 'duracion_min',
  'precio_desde', 'precio_hasta', 'moneda', 'num_sesiones', 'entrenadores_habilitados', 'activo', 'cupo'];

const dePlanta = ENTRENADORES.filter((e) => e[0].startsWith('ENT')).length;
const deClase = ENTRENADORES.filter((e) => e[0].startsWith('CLS')).length;
console.log('Config:        1 fila');
console.log(`Entrenadores:  ${ENTRENADORES.length} filas (${dePlanta} de planta, ${deClase} de clase)`);
console.log(`Servicios:     ${SERVICIOS.length} filas (con cupo > 1: ${SERVICIOS.filter((s) => +s[11] > 1).length})`);

if (!APLICAR) {
  console.log('\n(simulación — agregá --apply para escribir)');
  process.exit(0);
}

// Se limpia el área de datos antes de escribir, para no dejar restos de la carga anterior.
await call({
  method: 'POST',
  url: `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchClear`,
  payload: { ranges: ['Entrenadores!A2:I200', 'Servicios!A2:L200', 'Config!A2:I2'] },
});

await batchUpdate([
  { range: 'Config!A2', values: CONFIG },
  { range: 'Entrenadores!A2', values: ENTRENADORES },
  { range: 'Servicios!A1', values: [CAB_SERVICIOS] },
  { range: 'Servicios!A2', values: SERVICIOS },
]);
console.log('\nescrito');
