// Prueba offline del nombre real del cliente. No toca n8n ni Google: carga los nodos Code
// del repo y los corre con $() y $input mockeados.
//
//   node scripts/american-gym/probar-nombre.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const R = join(dirname(fileURLToPath(import.meta.url)), 'code');
const correr = (ruta, nodos, entradaInput) => {
  const src = readFileSync(ruta, 'utf8');
  const $ = (n) => {
    if (!(n in nodos)) throw new Error('nodo no mockeado: ' + n);
    return { first: () => ({ json: nodos[n] }), item: { json: nodos[n] } };
  };
  const $input = { first: () => ({ json: entradaInput }) };
  return new Function('$', '$input', `${src}`)($, $input)[0].json;
};

// ---------- Validar reglas: precedencia del nombre ----------
const caso = ({ dictado, enHoja, wa }) => correr(`${R}/motor/validar-reglas.js`, {
  'Normalizar entrada': { telefono: '+506 8888-9999', nombre_dictado: dictado, nombre_cliente: wa },
  'Preparar datos': {
    clientes: enHoja ? [{ id_cliente: 'CLI-0001', nombre_completo: enHoja, telefono: '(+506) 8888-9999', email: 'a@b.com' }] : [],
    oportunidades: [], servicios: [],
  },
  'Localizar cita': { citas_proximas: [], valoracion: { estado: 'ninguna', texto: '' },
    nombre_registrado: enHoja || '', email_registrado: !!enHoja },
}, { id_servicio: 'SRV-010', servicio: 'Plan', interpretacion: 'x' });

let r = caso({ dictado: 'Juan Pérez Mora', enHoja: 'Horarios ministros', wa: 'Horarios ministros' });
assert.strictEqual(r.nombre_cliente, 'Juan Pérez Mora', 'el dictado gana a la hoja');
r = caso({ dictado: '', enHoja: 'Juan Pérez Mora', wa: 'Horarios ministros' });
assert.strictEqual(r.nombre_cliente, 'Juan Pérez Mora', 'la hoja gana al perfil de WhatsApp');
assert.strictEqual(r.nombre_registrado, 'Juan Pérez Mora');
assert.strictEqual(r.email_registrado, true);
r = caso({ dictado: '', enHoja: null, wa: 'Horarios ministros' });
assert.strictEqual(r.nombre_cliente, 'Horarios ministros', 'sin nada más, el perfil de WhatsApp');
assert.strictEqual(r.nombre_registrado, '');
assert.strictEqual(r.email_registrado, false);

// ---------- Respuesta: el whitelist deja pasar los campos nuevos ----------
const resp = correr(`${R}/motor/respuesta.js`, {}, {
  ok: true, nombre_registrado: 'Juan Pérez Mora', email_registrado: true, alternativas: [],
});
assert.strictEqual(resp.nombre_registrado, 'Juan Pérez Mora');
assert.strictEqual(resp.email_registrado, true);
const resp2 = correr(`${R}/motor/respuesta.js`, {}, { ok: true, alternativas: [] });
assert.strictEqual(resp2.nombre_registrado, '');
assert.strictEqual(resp2.email_registrado, false);

// ---------- Cliente registrado (agente) ----------
const lookup = (values, tel) => correr(`${R}/agente/cliente-registrado.js`, {
  'Entrada de mensaje': { body: { sender: { phone_number: tel, name: 'Horarios ministros' } } },
}, { values });
const hoja = [
  ['id_cliente', 'nombre_completo', 'telefono', 'email'],
  ['CLI-0001', 'Juan Pérez Mora', '+506 8888-9999', 'juan@correo.com'],
  ['CLI-0002', 'Ana Vargas', '(+506) 8777-1111', ''],
];
let l = lookup(hoja, '+50688889999');
assert.strictEqual(l.nombre_registrado, 'Juan Pérez Mora');
assert.strictEqual(l.email_registrado, true);
assert.ok(l.frase.includes('Juan Pérez Mora') && l.frase.includes('ya está registrado'));
l = lookup(hoja, '+50687771111');
assert.strictEqual(l.email_registrado, false, 'Ana no tiene correo');
assert.ok(l.frase.includes('NO está registrado'));
l = lookup(hoja, '+50660000000');
assert.strictEqual(l.nombre_registrado, '');
assert.ok(l.frase.includes('no está registrado'));
// Sheets caído: onError deja pasar { error: ... } y el bot responde igual, sin nombre.
l = correr(`${R}/agente/cliente-registrado.js`, {
  'Entrada de mensaje': { body: { sender: { phone_number: '+50688889999', name: 'x' } } },
}, { error: 'boom' });
assert.strictEqual(l.nombre_registrado, '');
assert.ok(l.frase.length > 50);

console.log('todas las pruebas pasaron');
