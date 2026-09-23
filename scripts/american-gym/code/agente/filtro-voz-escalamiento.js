// Filtro de voz: el modelo a veces abre con frases de sistema ("la información disponible no
// confirma...") o anuncia el traspaso, que ya lo dice el aviso fijo. Se quitan esas frases; si no
// queda nada, se usa una frase neutra y humana.
const SUENA_A_SISTEMA = /informaci[oó]n\s+(disponible|actual)|no\s+confirma|no\s+(aparece|consta)|no\s+cuento\s+con\s+esa|no\s+(tiene|est[aá]|tengo)[^.]*confirmad|cat[aá]logo|base\s+de\s+datos|herramienta|voy\s+a\s+(pasar|derivar|escalar|trasladar)|(paso|derivo|traslado)\s+su\s+(consulta|caso)|persona\s+del\s+equipo/i;
const crudo = String(salida.respuesta || '').trim();
const frases = crudo.split(/(?<=[.!?])\s+/).filter((f) => f && !SUENA_A_SISTEMA.test(f));
const respuestaAgente = crudo
  ? (frases.join(' ').trim() || (salida.motivo_escalamiento === 'informacion_no_disponible' ? 'Déjeme preguntarlo para darle el dato exacto.' : ''))
  : '';
