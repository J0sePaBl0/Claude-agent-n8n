// Renombres mecánicos de Dulce María → American Gym sobre el código extraído del motor, el
// CRM y los correos. Lo que no es mecánico (reglas, bugs, textos de política) se edita a
// mano después y se revisa con un diff contra el original.
//
//   node scripts/american-gym/renombrar-codigo.mjs
//
// NO se aplica al prompt del agente: ahí "profesional" también es un adjetivo ("tono cercano y
// profesional") y el reemplazo ciego rompería el texto. El prompt se reescribe a mano.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODIGO = join(dirname(fileURLToPath(import.meta.url)), 'code');
const CARPETAS = ['motor', 'crm', 'correos'];

// Orden importa: primero los identificadores compuestos, después las palabras sueltas.
const REEMPLAZOS = [
  // columnas y campos del contrato
  [/\bid_paciente\b/g, 'id_cliente'],
  [/\bid_profesional\b/g, 'id_entrenador'],
  [/\bprofesionales_habilitados\b/g, 'entrenadores_habilitados'],
  [/\bprofesional_asignado\b/g, 'entrenador_asignado'],
  [/\bid_tratamiento\b/g, 'id_membresia'],
  [/\bconfirmada_por_paciente\b/g, 'confirmada_por_cliente'],
  [/\bnombre_paciente\b/g, 'nombre_cliente'],
  [/\bpaciente_existente\b/g, 'cliente_existente'],
  [/\bpaciente_row\b/g, 'cliente_row'],
  [/\bemail_paciente\b/g, 'email_cliente'],
  // prefijos de ids
  [/'PAC-'/g, "'CLI-'"],
  [/'PROF-'/g, "'ENT-'"],
  // el remitente de respaldo de los correos, antes de la regla general de "clínica"
  [/Clínica Dental Dulce María/g, 'American Gym'],
  // palabras sueltas, preservando mayúscula inicial
  [/\bpacientes\b/g, 'clientes'], [/\bPacientes\b/g, 'Clientes'],
  [/\bpaciente\b/g, 'cliente'], [/\bPaciente\b/g, 'Cliente'],
  [/\bprofesionales\b/g, 'entrenadores'], [/\bProfesionales\b/g, 'Entrenadores'],
  [/\bprofesional\b/g, 'entrenador'], [/\bProfesional\b/g, 'Entrenador'],
  // "clínica" es femenino y "gimnasio" masculino: primero las contracciones
  [/\bde la clínica\b/g, 'del gimnasio'],
  [/\ba la clínica\b/g, 'al gimnasio'],
  [/\bla clínica\b/g, 'el gimnasio'], [/\bLa clínica\b/g, 'El gimnasio'],
  [/\buna clínica\b/g, 'un gimnasio'],
  [/\bclínicas\b/g, 'gimnasios'], [/\bclínica\b/g, 'gimnasio'], [/\bClínica\b/g, 'Gimnasio'],
];

let total = 0;
for (const carpeta of CARPETAS) {
  for (const archivo of readdirSync(join(CODIGO, carpeta)).filter((f) => f.endsWith('.js'))) {
    const ruta = join(CODIGO, carpeta, archivo);
    const antes = readFileSync(ruta, 'utf8');
    let despues = antes;
    let cambios = 0;
    for (const [re, por] of REEMPLAZOS) {
      despues = despues.replace(re, () => { cambios += 1; return por; });
    }
    if (cambios) {
      writeFileSync(ruta, despues);
      console.log(`${carpeta}/${archivo}: ${cambios}`);
      total += cambios;
    }
  }
}
console.log(`\n${total} reemplazos`);
