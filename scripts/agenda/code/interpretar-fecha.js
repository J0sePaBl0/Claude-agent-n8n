// Resuelve en qué fechas/horas pensaba el paciente, a partir de sus palabras textuales.
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
let soloEntreSemana = false;
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
  if (sufijo === 'pm' && h < 12) h += 12;
  else if (sufijo === 'am' && h === 12) h = 0;
  else if (!sufijo) {
    // Sin am/pm: la clínica abre 08:00–18:00, así que "a las 3" son las 15:00.
    if (h >= 1 && h <= 7) h += 12;
    else if (franja === 'tarde' && h < 12) h += 12;
  }
  if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
    horaPretendida = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    entendido = true;
    if (!franja) franja = h < 12 ? 'manana' : 'tarde';
  }
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
// "a las 3:00 p. m.", no "a las 15:00": el agente repite este texto tal cual al paciente.
let nombreHora = '';
if (horaPretendida) {
  const [hh, mm] = horaPretendida.split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  nombreHora = ` a las ${h12}:${String(mm).padStart(2, '0')}${hh < 12 ? ' a. m.' : ' p. m.'}`;
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
