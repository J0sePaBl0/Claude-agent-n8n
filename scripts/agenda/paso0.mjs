// Paso 0 — sanear los datos del Sheet CRM - demo.
// Corre sin --apply para ver el diff; con --apply para escribir.
import { batchGet, batchUpdate } from './sheets.mjs';

const APPLY = process.argv.includes('--apply');
const P1 = 'PROF-01', P2 = 'PROF-02', P3 = 'PROF-03', P4 = 'PROF-04';

// --- 0a. Profesionales: los 4 reales de DM_01, reusando los ids ---
const PROFESIONALES = [
  ['id_profesional', 'nombre', 'especialidad', 'sede', 'dias_atencion', 'horario', 'duracion_slot_min', 'activo', 'id_calendar'],
  [P1, 'Dra. Dulce María Vargas Solano', 'Odontología general, estética, periodoncia y odontopediatría', 'SEDE-01', 'Lun;Mar;Mié;Jue;Vie;Sáb', '08:00-18:00', '30', 'TRUE', ''],
  [P2, 'Dra. Carolina Jiménez Ureña', 'Ortodoncia', 'SEDE-01', 'Lun;Mié;Vie', '08:00-12:00', '45', 'TRUE', ''],
  [P3, 'Dr. Andrés Zeledón Mora', 'Endodoncia', 'SEDE-01', 'Mar;Jue', '08:00-18:00', '60', 'TRUE', ''],
  [P4, 'Dr. Felipe Arias Rojas', 'Cirugía oral e implantología', 'SEDE-01', 'Mié;Sáb', 'Mié:13:00-18:00;Sáb:08:00-13:00', '60', 'TRUE', ''],
  ['PROF-05', 'Dra. Silvia Fernández Gómez', 'Periodoncia', 'SEDE-01', 'Mié;Vie', '08:00-16:00', '45', 'FALSE', ''],
  ['PROF-06', 'Dra. Paola Hernández Villalobos', 'Odontopediatría', 'SEDE-01', 'Lun;Mar;Mié;Jue', '08:00-15:00', '30', 'FALSE', ''],
];

// --- 0b + 0d. Servicios: profesional habilitado y duración por id ---
const SRV = {
  'SRV-001': { pro: [P1, P2, P3, P4].join(';'), dur: '30' },
  'SRV-002': { pro: P1, dur: '45' },
  'SRV-017': { pro: P1, dur: '60' },
  'SRV-018': { pro: P1, dur: '15' },
  'SRV-019': { pro: P1, dur: '20' },
  'SRV-004': { pro: `${P1};${P4}`, dur: '45' },   // DM_03: extracción simple 45 (era 30)
  'SRV-020': { pro: P4, dur: '45' },
  'SRV-005': { pro: P4, dur: '90' },              // DM_03: muela del juicio 90 (era 60)
  'SRV-003': { pro: P1, dur: '45' },
  'SRV-021': { pro: P1, dur: '60' },
  'SRV-022': { pro: P1, dur: '60' },
  'SRV-007': { pro: P1, dur: '60' },
  'SRV-023': { pro: P1, dur: '60' },
  'SRV-006': { pro: P3, dur: '120' },
  'SRV-024': { pro: P3, dur: '120' },
  'SRV-025': { pro: P3, dur: '120' },
  'SRV-026': { pro: P3, dur: '120' },
  'SRV-013': { pro: P1, dur: '90' },
  'SRV-027': { pro: P1, dur: '30' },
  'SRV-028': { pro: P1, dur: '60' },
  'SRV-029': { pro: P1, dur: '90' },
  'SRV-030': { pro: P1, dur: '60' },
  'SRV-008': { pro: P2, dur: '30' },
  'SRV-031': { pro: P2, dur: '30' },
  'SRV-009': { pro: P2, dur: '30' },
  'SRV-010': { pro: P2, dur: '20' },
  'SRV-011': { pro: P4, dur: '120' },             // DM_03: implante fase quirúrgica 120 (era 90)
  'SRV-032': { pro: P4, dur: '60' },
  'SRV-033': { pro: P1, dur: '60' },
  'SRV-034': { pro: P1, dur: '60' },
  'SRV-016': { pro: P1, dur: '30' },
  'SRV-035': { pro: P1, dur: '30' },
  'SRV-036': { pro: P1, dur: '30' },
  'SRV-037': { pro: P1, dur: '45' },
  'SRV-038': { pro: P1, dur: '45' },
  'SRV-012': { pro: P1, dur: '90' },   // inactivo
  'SRV-014': { pro: P1, dur: '15' },   // inactivo
  'SRV-015': { pro: P1, dur: '30' },   // inactivo
};

// --- 0c. Solo las citas/tratamientos VIVOS de PROF-05/06 pasan a PROF-01 ---
const CITAS_A_PROF01 = ['CITA-0011', 'CITA-0013', 'CITA-0014'];
const TRAT_A_PROF01 = ['TRAT-0005', 'TRAT-0006'];

// --- 0e. Config: la sede real de DM_01 ---
const CONFIG = [[
  'SEDE-01',
  'Clínica Dental Dulce María',
  'San Pablo de Heredia, 200 m norte de la iglesia católica, Plaza Aurora, local 4, segundo piso',
  '9.9989', '-84.0855',
  'https://maps.google.com/?q=9.9989,-84.0855',
  '+506 2263-8890',
  'Lun-Vie 08:00-18:00, Sáb 08:00-13:00',
  '+506 6012-3487',
]];

// --- 0f. Feriados de Costa Rica 2026 ---
const FERIADOS = [
  ['fecha', 'descripcion'],
  ['2026-01-01', 'Año Nuevo'],
  ['2026-04-02', 'Jueves Santo'],
  ['2026-04-03', 'Viernes Santo'],
  ['2026-04-11', 'Juan Santamaría'],
  ['2026-05-01', 'Día del Trabajo'],
  ['2026-07-25', 'Anexión de Guanacaste'],
  ['2026-08-02', 'Virgen de los Ángeles'],
  ['2026-08-15', 'Día de la Madre'],
  ['2026-09-15', 'Independencia'],
  ['2026-12-01', 'Abolición del Ejército'],
  ['2026-12-25', 'Navidad'],
];

const col = (rows) => rows.map((r) => (r && r[0] !== undefined ? String(r[0]) : ''));

const leido = await batchGet([
  'Servicios!A2:A39', 'Servicios!E2:E39', 'Servicios!K2:K39',
  'Citas!A2:A26', 'Citas!C2:C26',
  'Tratamientos!A2:A11', 'Tratamientos!D2:D11',
  'Config!A2:I2',
]);

const srvIds = col(leido['Servicios!A2:A39']);
const srvDurAnt = col(leido['Servicios!E2:E39']);
const srvProAnt = col(leido['Servicios!K2:K39']);
const citIds = col(leido['Citas!A2:A26']);
const citProAnt = col(leido['Citas!C2:C26']);
const tratIds = col(leido['Tratamientos!A2:A11']);
const tratProAnt = col(leido['Tratamientos!D2:D11']);

const faltantes = srvIds.filter((id) => !SRV[id]);
if (faltantes.length) throw new Error(`Servicios sin mapear: ${faltantes.join(', ')}`);

const srvDur = srvIds.map((id) => [SRV[id].dur]);
const srvPro = srvIds.map((id) => [SRV[id].pro]);
const citPro = citIds.map((id, i) => [CITAS_A_PROF01.includes(id) ? P1 : citProAnt[i]]);
const tratPro = tratIds.map((id, i) => [TRAT_A_PROF01.includes(id) ? P1 : tratProAnt[i]]);

// --- diff ---
console.log('=== Servicios: duración ===');
srvIds.forEach((id, i) => {
  if (srvDurAnt[i] !== srvDur[i][0]) console.log(`  ${id}  ${srvDurAnt[i]} -> ${srvDur[i][0]}`);
});
console.log('=== Servicios: profesionales_habilitados ===');
let n = 0;
srvIds.forEach((id, i) => {
  if (srvProAnt[i] !== srvPro[i][0]) { console.log(`  ${id}  ${srvProAnt[i]} -> ${srvPro[i][0]}`); n++; }
});
console.log(`  (${n} de ${srvIds.length} filas cambian)`);
console.log('=== Citas: id_profesional ===');
citIds.forEach((id, i) => {
  if (citProAnt[i] !== citPro[i][0]) console.log(`  ${id}  ${citProAnt[i]} -> ${citPro[i][0]}`);
});
console.log('=== Tratamientos: id_profesional ===');
tratIds.forEach((id, i) => {
  if (tratProAnt[i] !== tratPro[i][0]) console.log(`  ${id}  ${tratProAnt[i]} -> ${tratPro[i][0]}`);
});
console.log('=== Config: sede ===');
const cfgAnt = leido['Config!A2:I2'][0] || [];
CONFIG[0].forEach((v, i) => {
  if ((cfgAnt[i] || '') !== v) console.log(`  col ${String.fromCharCode(65 + i)}  ${cfgAnt[i] || '(vacío)'}\n           -> ${v}`);
});

const data = [
  { range: 'Profesionales!A1:I7', values: PROFESIONALES },
  { range: 'Servicios!E2:E39', values: srvDur },
  { range: 'Servicios!K2:K39', values: srvPro },
  { range: 'Citas!C2:C26', values: citPro },
  { range: 'Citas!R1:R1', values: [['id_evento_calendar']] },
  { range: 'Tratamientos!D2:D11', values: tratPro },
  { range: 'Config!A2:I2', values: CONFIG },
  { range: 'Feriados!A1:B12', values: FERIADOS },
];

if (!APPLY) {
  console.log('\n(dry run — volvé a correr con --apply para escribir)');
} else {
  const r = await batchUpdate(data);
  console.log(`\nescrito: ${r.totalUpdatedCells} celdas`);
  r.responses.forEach((x) => console.log(`  ${x.updatedRange.padEnd(26)} ${x.updatedCells} celdas`));
}
