// Red de regresión del motor de agenda.
//
//   node regresion.mjs              solo lecturas, no escribe nada, seguro a cualquier hora
//   node regresion.mjs --completo   agrega el camino de escritura (agenda y limpia después)
//
// Fija el comportamiento que YA funciona antes de agregarle cancelar/reagendar/confirmar.
// No compara contra una salida byte a byte —la agenda cambia sola con el paso de los días—
// sino contra invariantes: la malla anclada a la duración, los feriados, el contrato de que
// la herramienta nunca devuelve vacío, y el bug del 2026-08-07 (`ambiguo` sin la tarde).
const URL = 'https://n8n.trignia.com/webhook/agenda-test';
const COMPLETO = process.argv.includes('--completo');
const TEL = '+50660181661';          // Jp, PAC-0021: existe en Pacientes
const TEL_NUEVO = '+50600000000';    // no existe: dispara la regla de valoración previa

// Cada llamada al motor son ~2 lecturas de Sheets y el límite es 60 por minuto. Sin
// ritmo, la propia suite agota la cuota a mitad de camino: pasó la primera vez que se
// corrió completa. 2,5 s entre llamadas deja la tanda cómodamente por debajo del techo.
const RITMO_MS = 2500;
let ultima = 0;
const post = async (b) => {
  const espera = RITMO_MS - (Date.now() - ultima);
  if (espera > 0) await new Promise((s) => setTimeout(s, espera));
  ultima = Date.now();
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefono: TEL, nombre_paciente: 'Jp', ...b }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`webhook ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
};

let ok = 0, fail = 0;
const casos = [];
function check(nombre, cond, detalle) {
  if (cond) { ok++; casos.push(`  ✓ ${nombre}`); }
  else { fail++; casos.push(`  ✗ ${nombre}\n      ${detalle}`); }
}
const horas = (r) => (r.alternativas || []).map((s) => s.hora_inicio);
const fechas = (r) => [...new Set((r.alternativas || []).map((s) => s.fecha))];
const dow = (f) => new Date(f + 'T12:00:00Z').getUTCDay();   // 0 = domingo

// ---------------------------------------------------------------- contrato
console.log('\n── CONTRATO: la herramienta nunca devuelve vacío ──');
for (const fecha_texto of ['', 'mañana', 'el martes', 'la próxima semana en la tarde',
  'después del 15', 'el 5 de setiembre a las 3', 'asdfgh sin fecha', 'el domingo']) {
  const r = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-001', fecha_texto });
  check(`"${fecha_texto || '(vacío)'}" responde con alternativas e interpretación`,
    r.alternativas?.length > 0 && !!r.interpretacion && !!r.mensaje,
    `alternativas=${r.alternativas?.length} interpretacion=${JSON.stringify(r.interpretacion)}`);
}

// ---------------------------------------------------------------- malla por duración
console.log('\n── MALLA ANCLADA A duracion_min ──');
{
  const v = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-001', fecha_texto: 'el jueves' });
  const l = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-002', fecha_texto: 'el jueves' });
  const enMalla = (hs, paso) => hs.every((h) => {
    const [a, b] = h.split(':').map(Number);
    return ((a * 60 + b) - 8 * 60) % paso === 0;
  });
  check('valoración (30 min) cae en malla de 30 desde las 08:00', enMalla(horas(v), 30), horas(v).join(' '));
  check('limpieza (45 min) cae en malla de 45 desde las 08:00', enMalla(horas(l), 45), horas(l).join(' '));
  check('la agenda se ve distinta según el servicio', horas(v).join() !== horas(l).join(),
    `valoración=${horas(v).join(' ')} | limpieza=${horas(l).join(' ')}`);
}

// ---------------------------------------------------------------- reglas de día
console.log('\n── REGLAS DE DÍA (salen del Sheet, no del código) ──');
{
  const e = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-006', fecha_texto: 'el lunes' });
  check('endodoncia el lunes no ofrece el lunes', !fechas(e).some((f) => dow(f) === 1), fechas(e).join(' '));
  check('endodoncia solo ofrece martes o jueves', fechas(e).every((f) => [2, 4].includes(dow(f))),
    fechas(e).map((f) => f + '(d' + dow(f) + ')').join(' '));
  check('endodoncia siempre con PROF-03', (e.alternativas || []).every((s) => s.id_profesional === 'PROF-03'),
    [...new Set((e.alternativas || []).map((s) => s.id_profesional))].join(' '));
}
{
  const o = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-008', fecha_texto: 'la próxima semana' });
  check('ortodoncia solo lunes, miércoles o viernes', fechas(o).every((f) => [1, 3, 5].includes(dow(f))),
    fechas(o).map((f) => f + '(d' + dow(f) + ')').join(' '));
  check('ortodoncia solo por la mañana', horas(o).every((h) => h < '12:00'), horas(o).join(' '));
}
{
  const i = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-011', fecha_texto: 'el sábado' });
  const sab = (i.alternativas || []).filter((s) => dow(s.fecha) === 6);
  check('implante (120 min) el sábado no arranca después de las 11:00',
    sab.every((s) => s.hora_inicio <= '11:00'), sab.map((s) => s.fecha + ' ' + s.hora_inicio).join(' '));
}

// ---------------------------------------------------------------- días cerrados
console.log('\n── DÍAS CERRADOS ──');
{
  const todos = [];
  for (const t of ['esta semana', 'la próxima semana', 'la otra semana']) {
    const r = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-001', fecha_texto: t });
    todos.push(...fechas(r));
  }
  check('nunca ofrece domingos', !todos.some((f) => dow(f) === 0), todos.filter((f) => dow(f) === 0).join(' '));
  check('nunca ofrece el 2026-08-15 (sábado feriado)', !todos.includes('2026-08-15'), 'lo ofreció');
  const f = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-001', fecha_texto: 'el 15 de agosto' });
  check('pedir el 15 de agosto explica y ofrece otro día',
    !fechas(f).includes('2026-08-15') && f.alternativas?.length > 0, JSON.stringify(f.motivo));
}

// ---------------------------------------------------------------- valoración previa
console.log('\n── VALORACIÓN PREVIA (solo al agendar, no al consultar) ──');
{
  const c = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-002',
    fecha_texto: 'el jueves', telefono: TEL_NUEVO, nombre_paciente: 'Nadie' });
  check('consultar NO bloquea a un paciente nuevo', c.ok !== false || c.motivo !== 'requiere_valoracion_previa',
    JSON.stringify(c.motivo));
  const a = await post({ accion: 'agendar', id_servicio: 'SRV-002',
    fecha_texto: 'el jueves a las 8 de la mañana', telefono: TEL_NUEVO, nombre_paciente: 'Nadie' });
  check('agendar SÍ bloquea a un paciente nuevo', a.motivo === 'requiere_valoracion_previa', JSON.stringify(a.motivo));
  check('y le ofrece horarios de valoración en la misma respuesta',
    a.alternativas?.length > 0 && !!a.id_servicio_sugerido,
    `alt=${a.alternativas?.length} sugerido=${a.id_servicio_sugerido}`);
}

// ---------------------------------------------------------------- el bug del 2026-08-07
console.log('\n── AMBIGUO: la regresión del bug del 2026-08-07 ──');
{
  const r = await post({ accion: 'agendar', id_servicio: 'SRV-001', fecha_texto: 'el jueves' });
  check('un día entero sin hora devuelve motivo "ambiguo"', r.motivo === 'ambiguo', JSON.stringify(r.motivo));
  const hs = horas(r);
  check('las opciones NO son las primeras 4 del día seguidas',
    !(hs.length >= 4 && hs[0] === '08:00' && hs[1] === '08:30' && hs[2] === '09:00'), hs.join(' '));
  check('las opciones cubren mañana Y tarde', hs.some((h) => h < '12:00') && hs.some((h) => h >= '12:00'), hs.join(' '));
  check('el mensaje dice el total y aclara que son ejemplos',
    /\d+ espacios/.test(r.mensaje) && /por ejemplo/i.test(r.mensaje), r.mensaje);
}

// ---------------------------------------------------------------- escritura
if (COMPLETO) {
  console.log('\n── CAMINO DE ESCRITURA (agenda de verdad y limpia después) ──');
  const { batchGet, structure, tabs, n8n } = await import('./sheets.mjs');
  const antes = (await batchGet(['Citas!A:R']))['Citas!A:R'];

  // El día de prueba se elige en caliente. Fijarlo a mano rompe la prueba en cuanto el
  // paciente ya tiene una cita ese día: DM_03 prohíbe dos citas de tratamiento en la misma
  // fecha y el motor rechaza con `dos_citas_mismo_dia`, que es lo correcto pero no es lo
  // que esta prueba quiere medir.
  const digitos = (t) => String(t || '').replace(/\D/g, '').replace(/^506/, '');
  const pacientes = (await batchGet(['Pacientes!A:D']))['Pacientes!A:D'];
  const yo = (pacientes.find((p) => digitos(p[2]) === digitos(TEL)) || [])[0];
  const ocupados = new Set(antes.filter((f) => f[1] === yo
    && ['Solicitada', 'Confirmada'].includes(f[10])).map((f) => f[7]));

  const libre = await post({ accion: 'consultar_disponibilidad', id_servicio: 'SRV-001', fecha_texto: '' });
  const elegido = (libre.alternativas || []).find((s) => !ocupados.has(s.fecha));
  if (!elegido) throw new Error('no encontré un día libre para el paciente de prueba');

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const [aa, mm, dd] = elegido.fecha.split('-').map(Number);
  const [hh, mi] = elegido.hora_inicio.split(':').map(Number);
  const frase = `el ${dd} de ${MESES[mm - 1]} a las ${hh % 12 === 0 ? 12 : hh % 12}:`
    + `${String(mi).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
  console.log(`  (probando con "${frase}" → ${elegido.fecha} ${elegido.hora_inicio})`);

  // Todo lo que sigue va en try/finally: si la suite se cae a la mitad —pasó, por la cuota
  // de Sheets— la cita de prueba queda viva en la hoja del demo, con su evento en Calendar.
  // La limpieza relee la hoja en vez de confiar en un índice calculado antes de escribir.
  let idCita = null;
  try {
    const r = await post({ accion: 'agendar', id_servicio: 'SRV-001', fecha_texto: frase });
    idCita = r.id_cita || null;
    check('agendar con día y hora reserva', r.ok === true && r.agendada === true && !!r.id_cita,
      JSON.stringify(r.motivo));
    check('reserva exactamente la hora pedida', r.cita?.hora_inicio === elegido.hora_inicio,
      `pedida=${elegido.hora_inicio} dada=${r.cita?.hora_inicio}`);

    const despues = (await batchGet(['Citas!A:R']))['Citas!A:R'];
    const fila = despues.find((f) => f[0] === idCita) || [];
    check('la fila queda contigua, sin huecos', despues.length === antes.length + 1,
      `antes=${antes.length} después=${despues.length}`);
    check('estado Solicitada y canal Bot WhatsApp',
      fila[10] === 'Solicitada' && fila[11] === 'Bot WhatsApp', fila.slice(10, 12).join(' '));
    // Con el nodo normal de Sheets (USER_ENTERED) Google interpreta "08:00" como hora y lo
    // devuelve como "8:00". Por eso Citas se escribe por HTTP con RAW.
    check('la hora se guardó con cero a la izquierda, sin que Sheets la reinterprete',
      fila[8] === elegido.hora_inicio, `esperaba ${elegido.hora_inicio}, hay ${JSON.stringify(fila[8])}`);
    check('quedó el id del evento de Calendar en la columna R', !!fila[17], JSON.stringify(fila[17]));

    // Pedir lo mismo otra vez tiene que rechazarse. Da igual si el motivo es que el espacio
    // ya está ocupado o que el paciente tendría dos citas el mismo día: las dos reglas son
    // válidas y cuál dispare primero depende del día que tocó. Lo que no puede pasar es que
    // escriba una segunda fila.
    const repetida = await post({ accion: 'agendar', id_servicio: 'SRV-001', fecha_texto: frase });
    check('pedir el mismo espacio dos veces lo rechaza', repetida.ok === false && !repetida.id_cita,
      `motivo=${repetida.motivo} id_cita=${repetida.id_cita}`);
    check('y la respuesta rechazada igual trae salida', !!repetida.mensaje, JSON.stringify(repetida));
  } finally {
    if (!idCita) {
      console.log('  (no se reservó nada, no hay qué limpiar)');
    } else {
      const hoja = (await batchGet(['Citas!A:R']))['Citas!A:R'];
      const idx = hoja.findIndex((f) => f[0] === idCita);
      const fila = hoja[idx] || [];
      if (idx < 1) {
        console.log(`  ⚠ ${idCita} no aparece en la hoja: no se borró nada.`);
      } else {
        if (fila[17]) {
          const prof = (await batchGet(['Profesionales!A:I']))['Profesionales!A:I'];
          const cal = (prof.find((p) => p[0] === fila[2]) || [])[8];
          if (cal) {
            const w = await n8n('/workflows', { method: 'POST', body: {
              name: 'TEMP — Calendar delete (regresión)', settings: { executionOrder: 'v1' },
              nodes: [
                { id: 'w', name: 'Entrada', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0],
                  parameters: { httpMethod: 'POST', path: 'cal-del-reg', responseMode: 'lastNode', options: {} } },
                { id: 'd', name: 'Borrar', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0],
                  parameters: { method: 'DELETE', url: '={{ $json.body.url }}',
                    authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api',
                    options: { response: { response: { neverError: true } } } },
                  credentials: { googleCalendarOAuth2Api: { id: 'PTFrwFEcqS8cEEKT', name: 'Google Calendar account' } } },
              ],
              connections: { Entrada: { main: [[{ node: 'Borrar', type: 'main', index: 0 }]] } },
            } });
            await n8n(`/workflows/${w.id}/activate`, { method: 'POST', body: {} });
            await new Promise((s) => setTimeout(s, 2500));
            await fetch('https://n8n.trignia.com/webhook/cal-del-reg', { method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${fila[17]}` }) });
            await n8n(`/workflows/${w.id}`, { method: 'DELETE' });
          }
        }
        const sheetId = (await tabs()).find((p) => p.title === 'Citas').sheetId;
        await structure([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }]);
        const final = (await batchGet(['Citas!A:R']))['Citas!A:R'];
        check('la limpieza dejó la hoja como estaba', final.length === antes.length,
          `antes=${antes.length} final=${final.length}`);
      }
    }
  }
}

console.log('\n' + casos.join('\n'));
console.log(`\n${ok} pasaron, ${fail} fallaron`);
process.exitCode = fail ? 1 : 0;
