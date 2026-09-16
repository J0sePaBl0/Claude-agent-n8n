// Decide si este teléfono ya tiene una oportunidad ABIERTA (etapa distinta de Ganada/Perdida)
// y, si la tiene, si sigue viva o ya está dormida.
// Los filtros de Google Sheets solo soportan igualdad exacta, por eso el descarte de
// Ganada/Perdida se resuelve acá y no en el filtro del nodo anterior.
const DIAS_DORMANCIA = 60;

const lead = $('CRM - Normalizar teléfono').first().json;

// alwaysOutputData puede meter un item vacío {} cuando no hubo match: se descarta.
const filas = $input.all().map(i => i.json).filter(r => r && r.id_oportunidad);
const cerradas = ['Ganada', 'Perdida'];
const abiertas = filas.filter(r => r.etapa && !cerradas.includes(String(r.etapa).trim()));

// Días desde la última señal de vida. fecha_ultima_interaccion es la fuente real;
// fecha_creacion es el fallback para las filas creadas antes de que esa columna existiera.
// Si ninguna se puede parsear se devuelve null y NUNCA se asume dormancia: es preferible
// arrastrar una oportunidad vieja que cerrar una que sigue viva.
const diasSinActividad = (fila) => {
  const ref = String(fila.fecha_ultima_interaccion || fila.fecha_creacion || '').trim();
  const t = Date.parse(ref.replace(' ', 'T'));
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86400000;
};

const nuevo = {
  modo: 'evaluar_nuevo',
  id_oportunidad: '',
  id_oportunidad_dormida: '',
  dias_sin_actividad: '',
  id_cliente: '',
  nombre_lead: lead.nombre_lead || '',
  telefono: lead.telefono || '',
  fecha_creacion: lead.fecha_evento || '',
  canal_origen: 'WhatsApp',
  servicio_interes_actual: '',
  etapa: 'Nuevo',
  valor_estimado: '',
  asignado_a: 'Bot',
  fecha_seguimiento: '',
  motivo_perdida: '',
  notas_actuales: '',
  mensaje_texto: lead.mensaje_texto || '',
  fecha_evento: lead.fecha_evento || '',
};

if (abiertas.length > 0) {
  const a = abiertas[abiertas.length - 1]; // la más reciente de ese teléfono
  const dias = diasSinActividad(a);

  // Dormida: se cierra como Perdida y este mensaje arranca un ciclo de venta nuevo.
  if (dias !== null && dias > DIAS_DORMANCIA) {
    return [{ json: {
      ...nuevo,
      id_oportunidad_dormida: a.id_oportunidad,
      dias_sin_actividad: Math.round(dias),
    }}];
  }

  return [{ json: {
    modo: 'actualizar',
    id_oportunidad: a.id_oportunidad,
    id_oportunidad_dormida: '',
    dias_sin_actividad: dias === null ? '' : Math.round(dias),
    id_cliente: a.id_cliente || '',
    nombre_lead: a.nombre_lead || lead.nombre_lead || '',
    telefono: a.telefono || lead.telefono || '',
    fecha_creacion: a.fecha_creacion || '',
    canal_origen: a.canal_origen || 'WhatsApp',
    servicio_interes_actual: a.servicio_interes || '',
    etapa: a.etapa,
    valor_estimado: a.valor_estimado === 0 ? 0 : (a.valor_estimado || ''),
    asignado_a: a.asignado_a || 'Bot',
    fecha_seguimiento: a.fecha_seguimiento || '',
    motivo_perdida: a.motivo_perdida || '',
    notas_actuales: a.notas || '',
    mensaje_texto: lead.mensaje_texto || '',
    fecha_evento: lead.fecha_evento || '',
  }}];
}

// Teléfono sin oportunidad abierta: hay que EVALUAR si el mensaje amerita crear un lead.
return [{ json: nuevo }];