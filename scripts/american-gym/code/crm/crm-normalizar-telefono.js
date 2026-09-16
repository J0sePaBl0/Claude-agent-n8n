// Chatwoot manda el telefono en E.164 pegado (+50679934925) pero el CRM lo guarda
// en formato costarricense con espacio y guion (+506 7993-4925). El filtro de
// Google Sheets es igualdad EXACTA: sin normalizar, ninguna busqueda haria match.
const lead = $input.first().json;
const crudo = String(lead.telefono || '').trim();
const digitos = crudo.replace(/\D/g, '');

let telefono = crudo;
if (digitos.length === 11 && digitos.startsWith('506')) {
  telefono = `(+506) ${digitos.slice(3, 7)}-${digitos.slice(7, 11)}`;
} else if (digitos.length === 8) {
  // por si llega sin codigo de pais
  telefono = `(+506) ${digitos.slice(0, 4)}-${digitos.slice(4, 8)}`;
}

return [{ json: { ...lead, telefono, telefono_crudo: crudo } }];