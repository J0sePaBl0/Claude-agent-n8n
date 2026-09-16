// Punto único de convergencia: acá llegan las tres salidas posibles del flujo
// (oportunidad guardada, mensaje descartado, reclamo) para dejar UNA fila en Interacciones.
// Esta pestaña es la que conserva el historial de intenciones: la fila de Oportunidades
// solo guarda el estado ACTUAL y sobrescribe intencion/sentimiento/urgencia en cada mensaje.
const base = $('CRM - Validar salida de IA').first().json;

// El id definitivo solo existe si esta corrida generó una oportunidad nueva.
let id_oportunidad = base.id_oportunidad || '';
try {
  const gen = $('CRM - Generar id_oportunidad').first().json;
  if (gen && gen.id_oportunidad) id_oportunidad = gen.id_oportunidad;
} catch (e) {
  // El nodo no corrió en esta rama: es un reclamo, un no-lead, o una oportunidad ya existente.
}

let accion;
if (base.es_reclamo) accion = 'reclamo';
else if (!base.es_lead) accion = 'descartado_no_lead';
else if (base.modo === 'evaluar_nuevo') accion = 'oportunidad_creada';
else accion = 'oportunidad_actualizada';

// id_interaccion sin leer la hoja: timestamp + sufijo aleatorio. Evita la lectura extra y
// la condición de carrera que sí arrastra el correlativo OPP-XXXX.
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();

return [{ json: {
  id_interaccion: `INT-${stamp}-${sufijo}`,
  id_oportunidad,
  telefono: base.telefono || '',
  fecha: base.fecha_evento || '',
  canal: base.canal_origen || 'WhatsApp',
  mensaje: base.mensaje_texto || '',
  intencion: base.intencion || '',
  sentimiento: base.sentimiento || '',
  urgencia: base.urgencia || '',
  accion,
}}];