// Se reescriben solo los campos seguros; para un cliente que ya existe son los
// mismos valores que ya tenía, así que es un no-op.
const d = $('Confirmar y preparar').first().json;
const p = d.cliente_row || {};

// Google Sheets trata como FÓRMULA cualquier valor que empiece con "+", así que
// "+506 6000-0011" se guardaba como `#ERROR!`. Consecuencia: al cliente no se le volvía a
// encontrar nunca por teléfono — ficha nueva en cada reserva, sus citas invisibles para
// confirmar/cancelar, y el agente sin poder saludarlo por su nombre. El CRM ya guardaba
// "(+506) 8888-9999" por esta misma razón (un "(" no es fórmula); el motor no lo hacía.
// El formato da igual para buscar: todo se compara por dígitos.
const digitos = String(d.telefono || '').replace(/\D/g, '');
const telefono = digitos.length === 11 && digitos.startsWith('506')
  ? `(+506) ${digitos.slice(3, 7)}-${digitos.slice(7, 11)}`
  : (digitos.length === 8
    ? `(+506) ${digitos.slice(0, 4)}-${digitos.slice(4, 8)}`
    : String(d.telefono || '').replace(/^\+/, ''));

return [{
  json: {
    id_cliente: d.id_cliente,
    nombre_completo: d.nombre_cliente,
    telefono,
    // Clientes!D. `email_cliente` ya viene resuelto (el que dictó ahora, o el que ya
    // estaba en la hoja), así que para un cliente que no dio correo esto reescribe el
    // mismo valor y nunca lo borra.
    email: d.email_cliente || p.email || '',
    sede_preferida: p.sede_preferida || 'SEDE-01',
    estado: p.estado || 'Nuevo',
    fecha_registro: p.fecha_registro || d.fecha_creacion.slice(0, 10),
    canal_origen: p.canal_origen || 'WhatsApp',
    consentimiento_datos: p.consentimiento_datos || 'TRUE',
  },
}];