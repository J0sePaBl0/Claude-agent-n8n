// Resuelve en qué fechas/horas pensaba el cliente, a partir de sus palabras textuales.
// NUNCA falla: si no entiende, asume "lo más próximo disponible" y lo dice en interpretacion.
const TZ = 'America/Costa_Rica';
const entrada = $('Normalizar entrada').first().json;

const ahora = DateTime.now().setZone(TZ);
const hoy = ahora.startOf('day');
const fmt = (d) => d.toFormat('yyyy-MM-dd');
const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
const sinTildes = (s) => String(s || '').toLowerCase().replace(/[áéíóúüñ]/g, (c) => TILDES[c]).trim();

let t = ' ' + sinTildes(entrada.fecha_texto).replace(/[.,;!?¿¡]/g, ' ').replace(/\s+/g, ' ') + ' ';

const DIAS = { domingo: 7, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

let desde = null;
let hasta = null;
let franja = null;
let horaPretendida = null;
// Las horas que pueden haber querido decir: una sola, o dos cuando "a las 6" puede ser de
// mañana o de tarde y la sede está abierta en las dos.
let horasPosibles = [];
let soloEntreSemana = false;

// Apertura más temprana y cierre más tardío de Config.horario_atencion, en minutos, mirando
// todos los días. "Lun-Vie 05:00-22:00, Sáb 07:00-14:00" → 300 y 1320.
function horarioSede() {
  const sede = ($('Preparar datos').first().json.config || [])[0] || {};
  const rangos = [...String(sede.horario_atencion || '').matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  if (!rangos.length) return { apertura: 8 * 60, cierre: 18 * 60 };
  return {
    apertura: Math.min(...rangos.map((r) => +r[1] * 60 + +r[2])),
    cierre: Math.max(...rangos.map((r) => +r[3] * 60 + +r[4])),
  };
}
let diaEspecifico = false;
let etiquetaDia = null;
let entendido = false;

// ---------- 1. Franja horaria ----------
// Ojo: "mañana" es día y franja a la vez. La franja solo cuenta si lleva artículo
// delante ("en la mañana"), así que se saca del texto ANTES de buscar el día.
if (/\b(en|por|de|a) la manana\b/.test(t) || /\bla manana\b/.test(t)) {
  franja = 'manana';
  t = t.replace(/\b((en|por|de|a) )?la manana\b/g, ' ');
  entendido = true;
}
if (/\b(en|por|de|a) la tarde\b/.test(t) || /\bla tarde\b/.test(t)) {
  franja = 'tarde';
  t = t.replace(/\b((en|por|de|a) )?la tarde\b/g, ' ');
  entendido = true;
}
if (/\btemprano\b|\bprimera hora\b/.test(t)) { franja = 'manana'; entendido = true; }
if (/\bal final del dia\b|\bultima hora\b|\btardecita\b|\bnoche\b/.test(t)) { franja = 'tarde'; entendido = true; }

// ---------- 2. Hora pretendida ----------
const mHora = t.match(/\ba? ?las? (\d{1,2})(?::(\d{2}))?\s*(y media|y cuarto)?\s*(am|pm|a m|p m)?/)
  || t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(y media|y cuarto)?\s*(am|pm)\b/);
if (mHora) {
  let h = parseInt(mHora[1], 10);
  let min = mHora[2] ? parseInt(mHora[2], 10) : 0;
  if (mHora[3] === 'y media') min = 30;
  if (mHora[3] === 'y cuarto') min = 15;
  const sufijo = (mHora[4] || '').replace(/\s/g, '');
  const hhmm = (hh) => String(hh).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  if (sufijo === 'pm' && h < 12) h += 12;
  else if (sufijo === 'am' && h === 12) h = 0;
  else if (!sufijo && franja === 'tarde' && h < 12) h += 12;
  else if (!sufijo && !franja && h >= 1 && h <= 11) {
    // Sin am/pm ni franja: decide el horario REAL de la sede, no una suposición. En Dulce
    // María "a las 6" era siempre las 18:00 porque la clínica abría 08–18; un gimnasio que abre
    // a las 5:00 tiene clientes que entrenan a las 6 de la mañana. Si solo una de las dos horas
    // cae dentro del horario, es esa. Si caen las dos, NO se adivina: viajan las dos y el
    // motor devuelve `ambiguo` para que el agente pregunte.
    const { apertura, cierre } = horarioSede();
    const dentro = (hh) => hh * 60 + min >= apertura && hh * 60 + min < cierre;
    const am = dentro(h);
    const pm = dentro(h + 12);
    if (am && pm) horasPosibles = [hhmm(h), hhmm(h + 12)];
    else if (pm || (!am && h <= 7)) h += 12;
  }
  if (!horasPosibles.length && h >= 0 && h <= 23 && min >= 0 && min <= 59) {
    horaPretendida = hhmm(h);
    horasPosibles = [horaPretendida];
    if (!franja) franja = h < 12 ? 'manana' : 'tarde';
  }
  if (horasPosibles.length) entendido = true;
}

// ---------- 3. Día o rango ----------
const proximaOcurrencia = (destino) => {
  const delta = (destino - hoy.weekday + 7) % 7;
  return hoy.plus({ days: delta });
};

if (/\bpasado manana\b/.test(t)) {
  desde = hasta = hoy.plus({ days: 2 }); diaEspecifico = true; entendido = true;
} else if (/\bhoy\b/.test(t)) {
  desde = hasta = hoy; diaEspecifico = true; entendido = true;
} else if (/\bmanana\b/.test(t)) {
  desde = hasta = hoy.plus({ days: 1 }); diaEspecifico = true; entendido = true;
} else if (/\b(la )?(proxima|otra|siguiente) semana\b|\bla semana que viene\b/.test(t)) {
  const lunes = hoy.plus({ days: (8 - hoy.weekday) % 7 || 7 });
  desde = lunes; hasta = lunes.plus({ days: 5 }); etiquetaDia = 'la próxima semana'; entendido = true;
} else if (/\besta semana\b/.test(t)) {
  desde = hoy; hasta = hoy.plus({ days: (6 - hoy.weekday + 7) % 7 }); etiquetaDia = 'esta semana'; entendido = true;
} else if (/\bfin de semana\b/.test(t)) {
  desde = hasta = proximaOcurrencia(6); diaEspecifico = true; etiquetaDia = 'el fin de semana'; entendido = true;
} else if (/\bentre semana\b|\bdias? de semana\b/.test(t)) {
  desde = hoy; hasta = hoy.plus({ days: 21 }); soloEntreSemana = true; etiquetaDia = 'entre semana'; entendido = true;
}

// Fecha del mes EXPLÍCITA. Va antes del nombre del día porque es más específica.
// Antes no: el bucle de abajo encontraba "miercoles", hacía `break` y el número no se leía
// nunca, así que "el miércoles 23 de septiembre" resolvía al miércoles de esta semana —o sea
// HOY— y la reserva salía con una semana de diferencia. Visto en pruebas el 2026-09-16: el
// cliente pidió el 23, la clase quedó agendada para el 16 y el agente tuvo que escalar.
//
// Solo se toma cuando el número NO puede ser la hora disfrazada:
//   · "23 de septiembre"  → lleva mes, es una fecha sin discusión;
//   · "miércoles 23"      → mayor que 12, no es una hora de reloj de 12.
// "el miércoles 6" (1–12, sin mes) se deja como estaba, ganando el día de la semana, porque
// en "el miércoles 6 de la tarde" ese 6 es la hora.
// Literales de expresión regular, no `new RegExp('...')`: en una cadena hay que duplicar la
// contrabarra y es fácil que se pierda por el camino. Con una sola, '\b' es un backspace y
// '\d' es una "d" literal, y el match falla en silencio.
if (!desde) {
  const conMes = t.match(/\b(?:el |los )?(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)s? )?(\d{1,2}) de ([a-z]+)/);
  const trasDia = t.match(/\b(?:el |los )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)s? (\d{1,2})\b/);
  if (conMes && MESES[conMes[2]]) {
    const cand = hoy.set({ month: MESES[conMes[2]] }).set({ day: parseInt(conMes[1], 10) });
    if (cand.isValid) { desde = hasta = cand; diaEspecifico = true; entendido = true; }
  } else if (trasDia && parseInt(trasDia[1], 10) > 12) {
    let cand = hoy.set({ day: parseInt(trasDia[1], 10) });
    if (cand.isValid) {
      if (cand < hoy) cand = cand.plus({ months: 1 });
      desde = hasta = cand; diaEspecifico = true; entendido = true;
    }
  }
}

if (!desde) {
  for (const [nombre, num] of Object.entries(DIAS)) {
    if (new RegExp('\\b' + nombre + 's?\\b').test(t)) {
      desde = hasta = proximaOcurrencia(num); diaEspecifico = true; entendido = true; break;
    }
  }
}

// "el 5 de agosto", "el 5", "05/08"
if (!desde) {
  const mFechaLarga = t.match(/\bel? ?(\d{1,2}) de ([a-z]+)/);
  const mFechaCorta = t.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  const mDespues = t.match(/\b(despues|apartir|a partir) del? (\d{1,2})\b/);
  const mAntes = t.match(/\bantes del? (\d{1,2})\b/);
  const mDiaSolo = t.match(/\bel (\d{1,2})\b/);

  const armarDia = (dia, mes) => {
    let cand = hoy.set({ day: 1, month: mes || hoy.month }).set({ day: Math.min(dia, 28) });
    cand = cand.set({ day: dia });
    if (!cand.isValid) return null;
    if (!mes && cand < hoy) cand = cand.plus({ months: 1 });
    return cand;
  };

  if (mFechaLarga && MESES[mFechaLarga[2]]) {
    desde = hasta = armarDia(parseInt(mFechaLarga[1], 10), MESES[mFechaLarga[2]]);
    diaEspecifico = true; entendido = true;
  } else if (mFechaCorta) {
    desde = hasta = armarDia(parseInt(mFechaCorta[1], 10), parseInt(mFechaCorta[2], 10));
    diaEspecifico = true; entendido = true;
  } else if (mDespues) {
    const d = armarDia(parseInt(mDespues[2], 10));
    if (d) { desde = d.plus({ days: 1 }); hasta = desde.plus({ days: 21 }); etiquetaDia = 'después del ' + mDespues[2]; entendido = true; }
  } else if (mAntes) {
    const d = armarDia(parseInt(mAntes[1], 10));
    if (d) { desde = hoy; hasta = d.minus({ days: 1 }); etiquetaDia = 'antes del ' + mAntes[1]; entendido = true; }
  } else if (mDiaSolo) {
    desde = hasta = armarDia(parseInt(mDiaSolo[1], 10));
    diaEspecifico = true; entendido = true;
  }
}

// ---------- 4. Por defecto: lo más próximo ----------
if (!desde || !desde.isValid) { desde = hoy; hasta = hoy.plus({ days: 21 }); diaEspecifico = false; }
if (!hasta || !hasta.isValid || hasta < desde) hasta = desde;
if (desde < hoy) desde = hoy;

// ---------- 5. Texto legible para que el agente lo repita ----------
const nombreDia = (d) => d.setLocale('es').toFormat("cccc d 'de' LLLL");
const nombreFranja = franja === 'manana' ? ' por la mañana' : (franja === 'tarde' ? ' por la tarde' : '');
// "a las 3:00 p. m.", no "a las 15:00": el agente repite este texto tal cual al cliente.
let nombreHora = '';
if (horaPretendida) {
  const [hh, mm] = horaPretendida.split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  nombreHora = ` a las ${h12}:${String(mm).padStart(2, '0')}${hh < 12 ? ' a. m.' : ' p. m.'}`;
} else if (horasPosibles.length === 2) {
  const [hh, mm] = horasPosibles[0].split(':').map(Number);
  nombreHora = ` a las ${hh}:${String(mm).padStart(2, '0')} (de la mañana o de la tarde)`;
}

let interpretacion;
if (!entendido) {
  interpretacion = 'lo más próximo disponible';
} else if (etiquetaDia) {
  interpretacion = etiquetaDia + nombreFranja + nombreHora;
} else if (diaEspecifico) {
  interpretacion = 'el ' + nombreDia(desde) + nombreFranja + nombreHora;
} else {
  interpretacion = ('lo más próximo disponible' + nombreFranja + nombreHora);
}

return [{
  json: {
    desde: fmt(desde),
    hasta: fmt(hasta),
    hora_pretendida: horaPretendida,
    // Siempre un arreglo: [] sin hora, [h] con hora clara, [h, h+12] si es ambigua.
    // "Resolver slot pedido" y "Ordenar por cercanía" filtran por esto, no por hora_pretendida.
    horas_posibles: horasPosibles,
    franja,
    solo_entre_semana: soloEntreSemana,
    dia_especifico: diaEspecifico,
    entendido,
    interpretacion,
    ahora_iso: ahora.toISO(),
    hoy: fmt(hoy),
    texto_original: entrada.fecha_texto || '',
  },
}];
