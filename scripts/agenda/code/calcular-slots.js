// Calcula los espacios libres reales combinando Servicios, Profesionales, Citas,
// Feriados y el horario de la sede. Implementa las reglas de DM_01 y DM_03.
//
// Las reglas de DÍA por especialidad (endodoncia mar/jue, ortodoncia L/X/V mañana,
// implantes mié tarde o sáb) NO están codificadas acá: salen solas del cruce
// profesionales_habilitados x dias_atencion.
const TZ = 'America/Costa_Rica';
const MINUTOS_ANTES_DEL_CIERRE = 60;   // DM_01: el último espacio, una hora antes del cierre
const TOPE_LARGO_SEMANA = 16 * 60;     // DM_03: nada de +90 min después de las 4:00 p.m.
const TOPE_LARGO_SABADO = 11 * 60;     // DM_03: ni después de las 11:00 los sábados
const DURACION_LARGA = 90;
const HORAS_DE_ANTICIPACION = 2;       // no se ofrece un espacio que arranca ya mismo
const DIAS_HORIZONTE = 21;
const URGENCIAS = { 'PROF-01': [['10:00', '10:30'], ['15:00', '15:30']] };  // DM_01: 2 espacios diarios

const entrada = $('Normalizar entrada').first().json;
const pedido = $('Interpretar la fecha').first().json;

const datos = $('Preparar datos').first().json;
const servicios = datos.servicios;
const profesionales = datos.profesionales;
const citas = datos.citas;
const feriados = new Set(datos.feriados.map((f) => String(f.fecha || '').trim()));
const sede = datos.config[0] || {};

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
const esVerdadero = (v) => txt(v).toUpperCase() === 'TRUE';
const aMin = (hhmm) => {
  const m = txt(hhmm).match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
const aHora = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const ABREV = { 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab', 7: 'dom' };
const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' };
const norm = (s) => txt(s).toLowerCase().replace(/[áéíóúñ]/g, (c) => TILDES[c]);

const salir = (motivo, mensaje) => [{
  json: { ok: false, motivo, mensaje, interpretacion: pedido.interpretacion, alternativas: [], slots: [] },
}];

// ---------- 1. El servicio ----------
const servicio = servicios.find((s) => txt(s.id_servicio) === txt(entrada.id_servicio));
if (!servicio) {
  return salir('servicio_no_disponible',
    'No encuentro ese servicio en el catálogo de la clínica.');
}
if (!esVerdadero(servicio.activo)) {
  return salir('servicio_no_disponible',
    `${servicio.nombre} no se está ofreciendo en este momento.`);
}
const duracion = parseInt(txt(servicio.duracion_min), 10) || 30;

// ---------- 2. Profesionales elegibles ----------
const habilitados = txt(servicio.profesionales_habilitados).split(';').map(txt).filter(Boolean);
const equipo = profesionales.filter((p) => habilitados.includes(txt(p.id_profesional)) && esVerdadero(p.activo));
if (!equipo.length) {
  return salir('servicio_no_disponible',
    `Ahora mismo no hay un profesional disponible para ${servicio.nombre}.`);
}

// ---------- 3. Horarios ----------
// Profesionales.horario admite "08:00-18:00" y "Mié:13:00-18:00;Sáb:08:00-13:00"
function ventanaProfesional(horario, diaSemana) {
  const h = txt(horario);
  if (h.includes(':') && /[a-zA-ZáéíóúÁÉÍÓÚ]/.test(h.split('-')[0] || '')) {
    for (const bloque of h.split(';')) {
      const [dia, rango] = bloque.split(/:(.+)/);
      if (norm(dia).slice(0, 3) === ABREV[diaSemana] && rango) {
        const [ini, fin] = rango.split('-');
        return [aMin(ini), aMin(fin)];
      }
    }
    return null;
  }
  const [ini, fin] = h.split('-');
  const a = aMin(ini); const b = aMin(fin);
  return a !== null && b !== null ? [a, b] : null;
}

// Config.horario_atencion: "Lun-Vie 08:00-18:00, Sáb 08:00-13:00"
function ventanaSede(diaSemana) {
  const partes = txt(sede.horario_atencion).split(',');
  for (const parte of partes) {
    const m = norm(parte).match(/([a-z]{3})\s*(?:-\s*([a-z]{3}))?\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    const idx = (a) => Object.entries(ABREV).find(([, v]) => v === a)?.[0];
    const d1 = parseInt(idx(m[1]), 10);
    const d2 = m[2] ? parseInt(idx(m[2]), 10) : d1;
    if (d1 && diaSemana >= d1 && diaSemana <= d2) return [aMin(m[3]), aMin(m[4])];
  }
  return null;
}

// ---------- 4. Citas ocupadas, por profesional y día ----------
const ocupadas = {};
for (const c of citas) {
  if (!['Solicitada', 'Confirmada'].includes(txt(c.estado))) continue;
  const clave = txt(c.id_profesional) + '|' + txt(c.fecha);
  const ini = aMin(c.hora_inicio); const fin = aMin(c.hora_fin);
  if (ini === null || fin === null) continue;
  (ocupadas[clave] = ocupadas[clave] || []).push([ini, fin]);
}

// ---------- 5. Barrido de días ----------
const ahora = DateTime.fromISO(pedido.ahora_iso, { zone: TZ });
const minimo = ahora.plus({ hours: HORAS_DE_ANTICIPACION });
const hoy = DateTime.fromISO(pedido.hoy, { zone: TZ });
const pedidoDesde = DateTime.fromISO(pedido.desde, { zone: TZ });
// Se barre siempre desde hoy, aunque el paciente haya pedido un día lejano: es lo que
// permite ofrecer alternativas más cercanas sin una segunda llamada.
const inicioBarrido = hoy;
const finBarrido = pedidoDesde.plus({ days: DIAS_HORIZONTE });

// `dur` y `team` se pasan por parámetro para poder calcular también la malla de la
// valoración inicial con este MISMO generador. Duplicarlo en otro nodo sería dos fuentes
// para el mismo cálculo, que es justo lo que este motor existe para evitar.
function slotsDelDia(dia, paso, dur = duracion, team = equipo) {
  const fecha = dia.toFormat('yyyy-MM-dd');
  const ds = dia.weekday;
  const salida = [];
  if (ds === 7 || feriados.has(fecha)) return salida;            // domingos y feriados: cerrado
  if (pedido.solo_entre_semana && ds === 6) return salida;
  const sedeV = ventanaSede(ds);
  if (!sedeV) return salida;
  const limiteSede = sedeV[1] - MINUTOS_ANTES_DEL_CIERRE;
  const topeLargo = ds === 6 ? TOPE_LARGO_SABADO : TOPE_LARGO_SEMANA;

  for (const p of team) {
    const dias = txt(p.dias_atencion).split(';').map((d) => norm(d).slice(0, 3));
    if (!dias.includes(ABREV[ds])) continue;
    const propia = ventanaProfesional(p.horario, ds);
    if (!propia) continue;
    const abre = Math.max(propia[0], sedeV[0]);
    const cierra = Math.min(propia[1], sedeV[1]);
    const limite = Math.min(cierra, limiteSede);
    const choques = (ocupadas[txt(p.id_profesional) + '|' + fecha] || [])
      .concat(URGENCIAS[txt(p.id_profesional)] ? URGENCIAS[txt(p.id_profesional)].map(([a, b]) => [aMin(a), aMin(b)]) : []);

    for (let ini = abre; ini + dur <= limite; ini += paso) {
      if (dur > DURACION_LARGA && ini > topeLargo) continue;
      const fin = ini + dur;
      if (choques.some(([a, b]) => ini < b && fin > a)) continue;
      const arranque = dia.set({ hour: Math.floor(ini / 60), minute: ini % 60 });
      if (arranque < minimo) continue;
      salida.push({
        fecha,
        dia_semana: ds,
        hora_inicio: aHora(ini),
        hora_fin: aHora(fin),
        minuto_inicio: ini,
        id_profesional: txt(p.id_profesional),
        profesional: txt(p.nombre),
      });
    }
  }
  return salida;
}

// Malla anclada a la duración del servicio: una limpieza de 45 min da 08:00, 08:45,
// 09:30... y una valoración de 30 da 08:00, 08:30... La agenda se ve distinta según
// el servicio, que es como funciona una clínica de verdad.
let slots = [];
for (let d = inicioBarrido; d <= finBarrido; d = d.plus({ days: 1 })) {
  slots = slots.concat(slotsDelDia(d, duracion));
}

// Pasada de rescate: si el día que pidió quedó vacío, se recalcula ESE día con malla
// de 15 min. La malla anclada puede no ver un hueco que dejó una cancelación, y el
// contrato es no decir "no hay" cuando sí hay.
let huboRescate = false;
if (pedido.dia_especifico) {
  const dia = DateTime.fromISO(pedido.desde, { zone: TZ });
  if (!slots.some((s) => s.fecha === pedido.desde)) {
    const rescate = slotsDelDia(dia, 15);
    if (rescate.length) { slots = slots.concat(rescate); huboRescate = true; }
  }
}

slots.sort((a, b) => (a.fecha === b.fecha ? a.minuto_inicio - b.minuto_inicio : a.fecha < b.fecha ? -1 : 1));

// Lo que el paciente pidió, contra todo lo que existe. Cuando pidió un día concreto,
// "en rango" es ese día; cuando pidió un rango ("la próxima semana", "después del 15"),
// es ese rango. `slots` completo queda igual para poder ofrecer alternativas.
const enRango = slots.filter((s) => s.fecha >= pedido.desde && s.fecha <= pedido.hasta);

// ¿Por qué no hay nada el día que pidió? El motivo tiene que ser el REAL: decir que el
// profesional no atiende sábados cuando el problema es que ese sábado es feriado es
// mentirle al paciente.
let motivoDia = null;
if (pedido.dia_especifico && !slots.some((s) => s.fecha === pedido.desde)) {
  const dia = DateTime.fromISO(pedido.desde, { zone: TZ });
  const atiendeEseDia = equipo.some((p) => txt(p.dias_atencion).split(';')
    .map((d) => norm(d).slice(0, 3)).includes(ABREV[dia.weekday]));
  if (feriados.has(pedido.desde)) motivoDia = 'feriado';
  else if (dia.weekday === 7) motivoDia = 'domingo';
  else if (!atiendeEseDia) motivoDia = 'dia_no_habilitado';
  else motivoDia = 'dia_lleno';
}

// ---------- 6. La salida de emergencia del paciente nuevo ----------
// Si el servicio pedido NO es la valoración, se calcula TAMBIÉN su malla. Cuesta solo CPU
// sobre datos que ya se leyeron —ni una llamada más a Sheets— y le permite a "Validar
// reglas" ofrecer horarios concretos en la misma respuesta en vez de devolver
// `alternativas: []` y confiar en que el modelo haga una segunda llamada. Un contrato que
// depende de que el modelo haga algo es un contrato roto.
const SRV_VALORACION = 'SRV-001';
let slotsValoracion = [];
if (txt(servicio.id_servicio) !== SRV_VALORACION) {
  const sv = servicios.find((s) => txt(s.id_servicio) === SRV_VALORACION);
  if (sv && esVerdadero(sv.activo)) {
    const durV = parseInt(txt(sv.duracion_min), 10) || 30;
    const habV = txt(sv.profesionales_habilitados).split(';').map(txt).filter(Boolean);
    const equipoV = profesionales.filter((p) => habV.includes(txt(p.id_profesional)) && esVerdadero(p.activo));
    if (equipoV.length) {
      for (let d = inicioBarrido; d <= finBarrido; d = d.plus({ days: 1 })) {
        slotsValoracion = slotsValoracion.concat(slotsDelDia(d, durV, durV, equipoV));
      }
      slotsValoracion.sort((a, b) => (a.fecha === b.fecha
        ? a.minuto_inicio - b.minuto_inicio : a.fecha < b.fecha ? -1 : 1));
      slotsValoracion = slotsValoracion.slice(0, 60);
    }
  }
}

return [{
  json: {
    ok: true,
    motivo: motivoDia,
    slots_valoracion: slotsValoracion,
    interpretacion: pedido.interpretacion,
    id_servicio: txt(servicio.id_servicio),
    servicio: txt(servicio.nombre),
    duracion_min: duracion,
    requiere_valoracion: esVerdadero(servicio.requiere_valoracion),
    equipo: equipo.map((p) => ({ id: txt(p.id_profesional), nombre: txt(p.nombre), dias: txt(p.dias_atencion) })),
    hubo_rescate: huboRescate,
    total_slots: slots.length,
    total_en_rango: enRango.length,
    slots,
    slots_en_rango: enRango,
  },
}];
