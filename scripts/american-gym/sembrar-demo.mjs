// Siembra una serie de citas y clientes ficticios en American Gym para tener un llenado
// parcial de cara a la demo (además de CLI-0001..CLI-0004 / CITA-0001..0007 que ya existían).
// Pasa por el webhook REAL del motor (`agenda-test-american-gym`), no escribe el Sheet a mano:
// así cada cita respeta las reglas de disponibilidad del motor y además genera su evento real
// en el Google Calendar del entrenador correspondiente (scripts/american-gym/crear-calendarios.mjs).
//
//   cd scripts/agenda && TENANT=american-gym node ../american-gym/sembrar-demo.mjs [--apply]
//
// Sin --apply solo muestra el plan. Los teléfonos +506 6001-10XX son ficticios y fáciles de
// identificar/borrar después si hace falta.
const URL = 'https://n8n.trignia.com/webhook/agenda-test-american-gym';
const APPLY = process.argv.includes('--apply');
const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

const post = async (body) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`webhook ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
};

// Cada fila: [telefono, nombre_dictado, email, id_servicio, fecha_texto, confirmarDespues]
const RESERVAS = [
  ['+506 6001-1001', 'Fernanda Solano Rojas',        'fernanda.solano.demo@example.com',  'SRV-002', 'el jueves 17 de septiembre a las 7:00 a.m.',   true],
  ['+506 6001-1002', 'Diego Salazar Mora',            'diego.salazar.demo@example.com',    'SRV-003', 'el jueves 17 de septiembre a las 9:00 a.m.',   false],
  ['+506 6001-1003', 'Valeria Chacón Ureña',          'valeria.chacon.demo@example.com',   'SRV-001', 'el jueves 17 de septiembre a las 2:00 p.m.',   false],
  ['+506 6001-1004', 'Gabriela Mena Solís',           'gabriela.mena.demo@example.com',    'SRV-010', 'el viernes 18 de septiembre a las 7:00 a.m.',  true],
  ['+506 6001-1005', 'Kevin Araya Bonilla',           'kevin.araya.demo@example.com',      'SRV-011', 'el viernes 18 de septiembre a las 6:30 a.m.',  false],
  ['+506 6001-1006', 'Melissa Alvarado Chinchilla',   'melissa.alvarado.demo@example.com', 'SRV-002', 'el lunes 21 de septiembre a las 5:30 p.m.',    false],
  ['+506 6001-1007', 'Esteban Vargas Solano',         'esteban.vargas.demo@example.com',   'SRV-011', 'el lunes 21 de septiembre a las 6:00 p.m.',    true],
  ['+506 6001-1008', 'Andrea Jiménez Rojas',          'andrea.jimenez.demo@example.com',   'SRV-020', 'el lunes 21 de septiembre a las 5:00 p.m.',    false],
  ['+506 6001-1009', 'Luis Fernando Campos Rodríguez','luis.campos.demo@example.com',      'SRV-021', 'el martes 22 de septiembre a las 5:30 p.m.',   false],
  ['+506 6001-1010', 'Sofía Barrantes Núñez',         'sofia.barrantes.demo@example.com',  'SRV-022', 'el miércoles 23 de septiembre a las 6:00 p.m.', true],
  ['+506 6001-1011', 'Randall Solórzano Pérez',       'randall.solorzano.demo@example.com','SRV-026', 'el sábado 19 de septiembre a las 8:00 a.m.',   false],
  ['+506 6001-1012', 'Camila Rodríguez Vindas',       'camila.rodriguez.demo@example.com', 'SRV-024', 'el jueves 24 de septiembre a las 5:30 p.m.',   false],
];

console.log(`American Gym — ${RESERVAS.length} citas/clientes de demo:`);
RESERVAS.forEach(([tel, nombre, , srv, fecha, confirmar]) =>
  console.log(`  ${nombre.padEnd(32)} ${srv}  ${fecha}${confirmar ? '  -> se confirma después' : ''}`));

if (!APPLY) {
  console.log('\n(dry run — corré con --apply)');
  process.exit(0);
}

const resultados = [];
for (const [telefono, nombre_dictado, email, id_servicio, fecha_texto, confirmarDespues] of RESERVAS) {
  const r = await post({ accion: 'agendar', id_servicio, fecha_texto, telefono, nombre_dictado, email });
  if (!r.agendada) {
    console.log(`✗ ${nombre_dictado}: NO se agendó (${r.motivo}) — ${r.mensaje}`);
    resultados.push({ nombre_dictado, telefono, ok: false });
    await dormir(2500);
    continue;
  }
  console.log(`✓ ${r.id_cita}  ${nombre_dictado}  ${r.cita.texto}`);
  resultados.push({ nombre_dictado, telefono, ok: true, id_cita: r.id_cita, confirmarDespues });
  await dormir(2500);
}

console.log('\n── confirmando algunas para variar el estado ──');
for (const res of resultados.filter((r) => r.ok && r.confirmarDespues)) {
  const r = await post({ accion: 'confirmar', id_servicio: '', fecha_texto: '', telefono: res.telefono });
  console.log(`${r.ok ? '✓' : '✗'} ${res.nombre_dictado} (${res.id_cita}): ${r.mensaje}`);
  await dormir(2500);
}

const ok = resultados.filter((r) => r.ok).length;
console.log(`\n${ok}/${RESERVAS.length} citas agendadas.`);
