// Siguiente correlativo OPP-XXXX = max existente + 1.
// Limitación conocida y aceptada para este alcance de demo: si dos leads nuevos entraran
// de forma concurrente podrían leer el mismo máximo y colisionar.
const filas = $input.all().map(i => i.json).filter(r => r && r.id_oportunidad);
const nums = filas
  .map(r => parseInt(String(r.id_oportunidad).replace(/^OPP-/i, ''), 10))
  .filter(n => Number.isFinite(n));
const siguiente = (nums.length ? Math.max(...nums) : 0) + 1;

const prev = $('CRM - Validar salida de IA').first().json;
return [{ json: { ...prev, id_oportunidad: 'OPP-' + String(siguiente).padStart(4, '0') } }];