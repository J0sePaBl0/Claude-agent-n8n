// Nunca se reenvía la salida cruda del LLM al CRM: acá se valida contra los enums reales
// del Sheet y contra el catálogo de servicios, con fallbacks conservadores.
const raw = $input.first().json;
const ia = (raw && typeof raw.output === 'object' && raw.output !== null) ? raw.output : (raw || {});
const prev = $('CRM - Adjuntar catálogo de servicios').first().json;

const pick = (v, permitidos, fallback) => permitidos.includes(v) ? v : fallback;
const aBool = (v) => v === true || String(v).trim().toLowerCase() === 'true';

// Tiene que coincidir con el enum del esquema del clasificador y con Config!intencion del Sheet.
const intencion   = pick(ia.intencion,   ['Info precio', 'Agendar', 'Inscripción', 'Reprogramar', 'Reclamo'], 'Info precio');
const sentimiento = pick(ia.sentimiento, ['Positivo', 'Neutro', 'Negativo'], 'Neutro');
const urgencia    = pick(ia.urgencia,    ['Alta', 'Media', 'Baja'], 'Media');

// Un reclamo es un caso de servicio, no una venta: no abre ni mueve oportunidades.
// OJO: el escalamiento a una persona NO se decide acá. Lo resuelve el workflow principal
// (¿Requiere Escalamiento? → aviso por correo). Por eso este flujo ya no clasifica ni
// escribe requiere_humano: dos LLM distintos decidiendo lo mismo terminan contradiciéndose.
const es_reclamo = intencion === 'Reclamo';

// servicio_interes debe existir en el catálogo real; si no, se descarta y se deja rastro en notas.
const ids = Array.isArray(prev.ids_validos) ? prev.ids_validos : [];
const servicio_ia = ia.servicio_interes ? String(ia.servicio_interes).trim() : '';
const servicio_valido = ids.includes(servicio_ia) ? servicio_ia : '';
const nota_servicio = (servicio_ia && !servicio_valido) ? `[IA sugirió "${servicio_ia}", sin match en catálogo] ` : '';

// Si ya existe una oportunidad abierta para este teléfono, ya se decidió antes que es un lead:
// no se le vuelve a preguntar a la IA en cada mensaje de la conversación.
const es_nuevo = prev.modo === 'evaluar_nuevo';
const es_lead = es_nuevo ? aBool(ia.es_lead) : true;

const notas = es_nuevo
  ? `${nota_servicio}Lead generado automáticamente desde WhatsApp. Primer mensaje: "${prev.mensaje_texto}"`
  : `${prev.notas_actuales ? prev.notas_actuales + '\n' : ''}[${prev.fecha_evento}] ${nota_servicio}${prev.mensaje_texto}`;

return [{ json: {
  es_lead,
  es_reclamo,
  modo: prev.modo,
  id_oportunidad: prev.id_oportunidad || '',
  id_cliente: prev.id_cliente || '',
  nombre_lead: prev.nombre_lead || '',
  telefono: prev.telefono || '',
  fecha_creacion: prev.fecha_creacion || prev.fecha_evento || '',
  canal_origen: prev.canal_origen || 'WhatsApp',
  servicio_interes: servicio_valido || prev.servicio_interes_actual || '',
  etapa: prev.etapa || 'Nuevo',
  valor_estimado: prev.valor_estimado === 0 ? 0 : (prev.valor_estimado || ''),
  intencion,
  sentimiento,
  urgencia,
  asignado_a: prev.asignado_a || 'Bot',
  fecha_seguimiento: prev.fecha_seguimiento || '',
  motivo_perdida: prev.motivo_perdida || '',
  notas,
  // Marca de última actividad: es lo que alimenta la regla de dormancia en la próxima corrida.
  fecha_ultima_interaccion: prev.fecha_evento || '',
  // Se arrastran para la fila de Interacciones que se escribe al final del flujo.
  mensaje_texto: prev.mensaje_texto || '',
  fecha_evento: prev.fecha_evento || '',
}}];