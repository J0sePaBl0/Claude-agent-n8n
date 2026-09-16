const cfg = $('Configuración Clínica').item.json;
const tz = cfg.timezone || 'America/Costa_Rica';
const now = DateTime.now().setZone(tz);

const dayMap = { domingo: 7, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6 };
const dias = String(cfg.horario_dias || 'lunes a viernes').toLowerCase().trim();
let startDay = 1;
let endDay = 5;
const m = dias.match(/([a-záéíóúü]+)\s+a\s+([a-záéíóúü]+)/i);
if (m && dayMap[m[1]] && dayMap[m[2]]) {
  startDay = dayMap[m[1]];
  endDay = dayMap[m[2]];
}
const weekday = now.weekday;
const inDayRange = startDay <= endDay
  ? (weekday >= startDay && weekday <= endDay)
  : (weekday >= startDay || weekday <= endDay);

const [hI, miI] = String(cfg.horario_inicio || '08:00').split(':').map(Number);
const [hF, miF] = String(cfg.horario_fin || '18:00').split(':').map(Number);
const nowMin = now.hour * 60 + now.minute;
const inTimeRange = nowMin >= (hI * 60 + miI) && nowMin <= (hF * 60 + miF);

const dentroHorario = inDayRange && inTimeRange;
const mensaje_final = dentroHorario
  ? cfg.mensaje_escalamiento_dentro_horario
  : cfg.mensaje_escalamiento_fuera_horario;

return [{ json: { mensaje_final, dentro_horario: dentroHorario } }];