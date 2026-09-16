// Quién es la persona que escribe, ANTES de que el agente abra la boca.
//
// Entra la respuesta cruda de `values/Clientes!A:Q`: se lee la pestaña entera y las columnas
// se buscan POR ENCABEZADO, no por posición, para que reordenarlas en el Sheet no rompa
// esto en silencio.
//
// El agente tiene que saludar por el nombre REAL del cliente, y el único lugar donde ese
// nombre existe es Clientes!B (lo dicta el cliente cuando se registra al agendar). El
// nombre del perfil de WhatsApp NO sirve: es un apodo, el nombre de quien prestó el
// teléfono o un negocio, y en el número del demo es directamente el de otra cuenta.
//
// La lectura se hace acá y no dentro de la agenda porque el saludo pasa antes de cualquier
// herramienta: si esperáramos a la primera llamada al motor, el primer mensaje siempre
// saldría sin nombre. Cuelga de "¿Bot Puede Responder?" para no gastar una lectura de
// Sheets en los mensajes que el bot no va a contestar (conversación tomada por una
// persona), y el nodo de arriba tiene onError=continueRegularOutput: si Google falla, se
// sigue sin nombre, nunca sin respuesta.
//
// Salida: `frase`, ya redactada para el system message. El modelo no tiene que deducir nada
// a partir de campos sueltos — ese contrato ya se rompió antes en este demo.
const entrada = $('Entrada de mensaje').first().json;
const cruda = $input.first().json;

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// La hoja mezcla "+506 8888-9999" y "(+506) 8888-9999": se compara solo por dígitos.
const digitos = (t) => txt(t).replace(/\D/g, '').replace(/^506/, '');

const remitente = ((entrada.body || {}).sender) || {};
const tel = digitos(remitente.phone_number);

const filas = Array.isArray(cruda.values) ? cruda.values : [];
const cabeceras = (filas[0] || []).map((h) => txt(h));
const iTel = cabeceras.indexOf('telefono');
const iNombre = cabeceras.indexOf('nombre_completo');
const iEmail = cabeceras.indexOf('email');

let nombre = '';
let tieneEmail = false;
if (tel && iTel >= 0) {
  const fila = filas.slice(1).find((f) => digitos(f[iTel]) && digitos(f[iTel]) === tel);
  if (fila) {
    nombre = txt(fila[iNombre]);
    tieneEmail = !!txt(fila[iEmail]);
  }
}

const frase = nombre
  ? `Este número ya está registrado en el gimnasio a nombre de ${nombre}. Tratalo por su `
    + 'nombre de pila desde el saludo y NO le pidas que te lo vuelva a decir. '
    + (tieneEmail
      ? 'Su correo electrónico ya está registrado: tampoco se lo pidas de nuevo.'
      : 'Su correo electrónico NO está registrado: pediselo una sola vez antes de agendar.')
  : 'Este número todavía no está registrado y no sabemos cómo se llama la persona. No la '
    + 'trates por ningún nombre hasta que ella misma te lo diga: el nombre que muestra '
    + 'WhatsApp no es confiable. Antes de agendar, pedile en un mismo mensaje su nombre '
    + 'completo y su correo electrónico.';

return [{
  json: {
    cliente_existente: !!nombre,
    nombre_registrado: nombre,
    email_registrado: tieneEmail,
    nombre_whatsapp: txt(remitente.name),
    frase,
  },
}];
