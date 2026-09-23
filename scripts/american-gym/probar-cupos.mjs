// Prueba de cupos / overbooking contra el motor REAL de American Gym (webhook agenda-test).
// ESCRIBE en Citas/Clientes/Actividades y crea eventos en Calendar; al final cancela todo lo
// que creó (las filas quedan `Cancelada`, teléfonos ficticios +506 6002-2NNN, sin correo).
//
//   node scripts/american-gym/probar-cupos.mjs [--sin-concurrencia]
//
// Qué valida:
//   T0  catálogo: solo las clases grupales tienen cupo > 1; el resto es cita 1 a 1 o no agendable
//   T1  línea base de la clase: se ofrece con el cupo completo
//   T2  cada reserva baja en 1 los cupos libres; la misma persona no se inscribe dos veces
//   T3  con 0 libres: la clase no se ofrece y una persona NUEVA es rechazada
//   T4  cancelar libera 1 cupo, otra persona nueva lo toma, la siguiente es rechazada
//   T5  una clase no le gasta cupo a otra a la misma hora
//   T6  servicios sin cupo: 1 a 1 no habla de cupos; lo limita cuántos entrenadores están
//       libres a esa hora, no un número de campos; una membresía no se agenda
//   T7  ráfaga concurrente (cupo + 4 a la vez): exactamente `cupo` aceptadas, ninguna de más
const URL = 'https://n8n.trignia.com/webhook/agenda-test-american-gym';
const CLASE = 'SRV-025';   // Virtual Cycling
const CUPO = 12;
const SECUENCIAL = { texto: 'el viernes 9 de octubre a las 7:00 a.m.', fecha: '2026-10-09', hora: '07:00' };
const RAFAGA = { texto: 'el viernes 16 de octubre a las 7:00 a.m.', fecha: '2026-10-16', hora: '07:00' };
const OTRA_CLASE = { id: 'SRV-011', cupo: 15, texto: 'el viernes 9 de octubre a las 6:00 a.m.', fecha: '2026-10-09', hora: '06:00' };
const UNO_A_UNO = { id: 'SRV-001', texto: 'el martes 13 de octubre a las 5:00 p.m.', fecha: '2026-10-13', hora: '17:00' };
const MEMBRESIA = 'SRV-100';
// Cupos que el Sheet DEBE tener (fuente: cargar-catalogo.mjs).
const CUPOS_ESPERADOS = { 'SRV-010': 6, 'SRV-011': 15, 'SRV-020': 15, 'SRV-021': 20, 'SRV-022': 20,
  'SRV-023': 25, 'SRV-024': 20, 'SRV-025': 12, 'SRV-026': 20, 'SRV-027': 20 };
const PAUSA = 2500;   // Sheets: 60 lecturas/min
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

const post = async (body, intentos = 3) => {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const t = await r.text();
      if (!r.ok) throw new Error(`webhook ${r.status}: ${t.slice(0, 200)}`);
      return JSON.parse(t);
    } catch (e) {
      // `agendar` NO se reintenta: no es idempotente y un reintento a ciegas es justo lo que
      // metía reservas de más.
      if (i === intentos || body.accion === 'agendar') return { error: String(e.message || e) };
      await dormir(3000);
    }
  }
};

let fallos = 0;
const chequeo = (ok, nombre, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${detalle !== '' ? `  — ${detalle}` : ''}`);
};

let siguiente = 100;   // cada persona de la prueba es un teléfono distinto
const nueva = () => siguiente++;
const tel = (n) => `+506 6002-2${String(n).padStart(3, '0')}`;
const creadas = new Set();   // personas con cita viva, para la limpieza final
const agendar = async (n, dia, id = CLASE) => {
  const r = await post({ accion: 'agendar', id_servicio: id, fecha_texto: dia.texto, telefono: tel(n), nombre_dictado: `Prueba Cupo ${n}` });
  if (r.agendada) creadas.add(n);
  return r;
};
const cancelar = (n) => post({ accion: 'cancelar', id_servicio: '', fecha_texto: '', telefono: tel(n) });
const consultar = (id, texto) => post({ accion: 'consultar_disponibilidad', id_servicio: id, fecha_texto: texto });

// Cupos libres que el motor ofrece en fecha+hora; null = el espacio no se ofrece.
const libres = async (dia, id = CLASE) => {
  const r = await consultar(id, dia.texto);
  if (r.error) return { error: r.error };
  const a = (r.alternativas || []).find((x) => x.fecha === dia.fecha && x.hora_inicio === dia.hora);
  return { libres: a ? a.cupos_libres : null, r };
};
const resumen = (r) => (r.error ? `error: ${r.error}` : `${r.motivo || 'ok'}: ${(r.mensaje || '').slice(0, 110)}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('── T0. Catálogo: cupo solo en clases grupales ──');
for (const [id, cupo] of Object.entries(CUPOS_ESPERADOS)) {
  const r = await consultar(id, 'la próxima semana');
  const a = (r.alternativas || [])[0] || {};
  chequeo(r.es_clase_grupal === true && a.cupo === cupo, `${id} ${r.servicio || ''}: clase grupal con cupo ${cupo}`,
    `es_clase_grupal=${r.es_clase_grupal} cupo=${a.cupo}`);
  await dormir(PAUSA);
}
for (const id of ['SRV-001', 'SRV-003']) {
  const r = await consultar(id, 'la próxima semana');
  const a = (r.alternativas || [])[0] || {};
  const hablaDeCupo = /cupo|campos/i.test(`${r.mensaje} ${(r.alternativas || []).map((x) => x.texto).join(' ')}`);
  chequeo(r.es_clase_grupal === false && a.cupo === 1 && !hablaDeCupo, `${id} ${r.servicio || ''}: cita 1 a 1, sin cupo`,
    `es_clase_grupal=${r.es_clase_grupal} cupo=${a.cupo} menciona_cupo=${hablaDeCupo}`);
  await dormir(PAUSA);
}

console.log('\n── T1. Línea base ──');
let l = await libres(SECUENCIAL);
chequeo(!l.error && l.libres === CUPO, `el espacio se ofrece con ${CUPO} cupos libres`, l.error || `libres=${l.libres}`);
if (l.error || l.libres !== CUPO) {
  console.log('\nLa clase no está vacía en línea base. Abortando sin escribir nada.');
  process.exit(1);
}
await dormir(PAUSA);

console.log(`\n── T2. Llenado secuencial (1..${CUPO}): cada reserva baja 1 cupo ──`);
const inscritas = [];
for (let i = 1; i <= CUPO; i++) {
  const n = nueva();
  const r = await agendar(n, SECUENCIAL);
  if (r.agendada) inscritas.push(n);
  chequeo(r.agendada === true, `reserva ${i}/${CUPO}`, r.agendada ? r.id_cita : resumen(r));
  await dormir(PAUSA);
  if (i === 1) {
    const dup = await agendar(n, SECUENCIAL);
    chequeo(dup.agendada === false && dup.motivo === 'ya_inscrito', 'la misma persona no se inscribe dos veces', resumen(dup));
    await dormir(PAUSA);
  }
  l = await libres(SECUENCIAL);
  const esperado = CUPO - i === 0 ? null : CUPO - i;
  chequeo(l.libres === esperado, `quedan ${CUPO - i} libres`, `el motor ofrece ${l.libres === null ? 'nada (llena)' : l.libres}`);
  await dormir(PAUSA);
}

console.log('\n── T3. Con 0 cupos no deja agendar más ──');
const sobra = await agendar(nueva(), SECUENCIAL);
chequeo(sobra.agendada === false && !sobra.error, 'una persona nueva es rechazada', resumen(sobra));
await dormir(PAUSA);

console.log('\n── T4. Cancelar libera un cupo ──');
const sale = inscritas[2];
const c = await cancelar(sale);
if (c.ok) creadas.delete(sale);
chequeo(c.ok === true, `cancela ${tel(sale)}`, resumen(c));
await dormir(PAUSA);
l = await libres(SECUENCIAL);
chequeo(l.libres === 1, 'vuelve a haber 1 cupo libre', `libres=${l.libres}`);
await dormir(PAUSA);
const entra = await agendar(nueva(), SECUENCIAL);
chequeo(entra.agendada === true, 'una persona nueva toma el cupo liberado', resumen(entra));
await dormir(PAUSA);
l = await libres(SECUENCIAL);
chequeo(l.libres === null, 'la clase vuelve a estar llena', `libres=${l.libres}`);
await dormir(PAUSA);
const otra = await agendar(nueva(), SECUENCIAL);
chequeo(otra.agendada === false && !otra.error, 'y la siguiente persona nueva es rechazada', resumen(otra));
await dormir(PAUSA);

console.log('\n── T5. Una clase no le gasta cupo a otra ──');
const box = await libres(OTRA_CLASE, OTRA_CLASE.id);
chequeo(box.libres === OTRA_CLASE.cupo, `Jungle Box el mismo viernes sigue con ${OTRA_CLASE.cupo}`, `libres=${box.libres}`);
await dormir(PAUSA);

console.log('\n── T6. Servicios sin cupo ──');
// En 1 a 1 el límite no es un cupo: es cuántos entrenadores están libres a esa hora. El martes
// a las 5:00 p. m. atienden dos de planta (Norman 13-21 y Luis 17-21), así que entran dos
// personas, cada una con su entrenador, y la tercera no.
l = await libres(UNO_A_UNO, UNO_A_UNO.id);
chequeo(l.libres === 1, `${UNO_A_UNO.id} se ofrece ${UNO_A_UNO.texto}, sin cupo de clase`, `cupos_libres=${l.libres}`);
await dormir(PAUSA);
const a1 = await agendar(nueva(), UNO_A_UNO, UNO_A_UNO.id);
await dormir(PAUSA);
const a2 = await agendar(nueva(), UNO_A_UNO, UNO_A_UNO.id);
await dormir(PAUSA);
const a3 = await agendar(nueva(), UNO_A_UNO, UNO_A_UNO.id);
await dormir(PAUSA);
chequeo(a1.agendada === true && a2.agendada === true, 'dos personas a la misma hora', `${resumen(a1)} | ${resumen(a2)}`);
chequeo(a1.cita && a2.cita && a1.cita.id_entrenador !== a2.cita.id_entrenador,
  'cada una con un entrenador distinto (nunca dos en la misma agenda)', `${a1.cita?.entrenador} / ${a2.cita?.entrenador}`);
chequeo(a3.agendada === false && !a3.error, 'la tercera es rechazada: no quedan entrenadores libres', resumen(a3));
const hablaDeCupo = /cupo|campos/i.test(`${a1.mensaje} ${a2.mensaje}`);
chequeo(!hablaDeCupo && a1.es_clase_grupal !== true, 'la respuesta no habla de cupos');
const mem = await agendar(nueva(), SECUENCIAL, MEMBRESIA);
chequeo(mem.agendada === false && mem.motivo === 'servicio_no_disponible', 'una membresía no se agenda', resumen(mem));
await dormir(PAUSA);

let rafaga = null;
if (!process.argv.includes('--sin-concurrencia')) {
  const total = CUPO + 4;
  console.log(`\n── T7. Ráfaga concurrente: ${total} personas a la vez para ${CUPO} cupos ──`);
  const t0 = Date.now();
  const personas = Array.from({ length: total }, () => nueva());
  const res = await Promise.all(personas.map((n) => agendar(n, RAFAGA)));
  const ok = res.filter((r) => r.agendada === true);
  const errores = res.filter((r) => r.error);
  rafaga = { aceptadas: ok.length, errores: errores.length, segundos: Math.round((Date.now() - t0) / 1000) };
  console.log(`  aceptadas=${ok.length}  rechazadas=${res.filter((r) => r.agendada === false).length}  `
    + `errores=${errores.length}  (${rafaga.segundos}s)`);
  errores.slice(0, 3).forEach((e) => console.log(`    ${e.error}`));
  chequeo(errores.length === 0, 'todas las llamadas responden');
  chequeo(ok.length === CUPO, `exactamente ${CUPO} aceptadas, ninguna de más`);
  const ids = ok.map((r) => r.id_cita);
  chequeo(new Set(ids).size === ids.length, 'cada reserva con su propio id de cita', ids.join(' '));
  await dormir(PAUSA);
  l = await libres(RAFAGA);
  chequeo(l.libres === null, 'después de la ráfaga la clase figura llena', `libres=${l.libres}`);
}

console.log('\n── Limpieza: cancelando todo lo creado ──');
for (const n of [...creadas]) {
  const r = await cancelar(n);
  console.log(`  ${r.ok ? '✓' : '✗'} ${tel(n)} ${r.ok ? 'cancelada' : resumen(r)}`);
  await dormir(PAUSA);
}
console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} verificación(es) fallaron`}`
  + `${rafaga ? ` — ráfaga: ${rafaga.aceptadas} aceptadas en ${rafaga.segundos}s` : ''}`);
process.exit(fallos ? 1 : 0);
