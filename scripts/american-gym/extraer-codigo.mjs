// Saca el código de los Code nodes (y los textos largos: prompts, esquemas, descripciones de
// herramientas) de los workflows archivados de Dulce María a archivos sueltos, para
// adaptarlos al gimnasio con un editor y revisar el cambio con un diff.
//
//   node scripts/american-gym/extraer-codigo.mjs <destino>
//
// Solo lee `archivo/dulce-maria/workflows/*.json`. No toca n8n.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESTINO = process.argv[2];
if (!DESTINO) throw new Error('uso: node extraer-codigo.mjs <carpeta-destino>');

export const ORIGENES = {
  motor: 'agenda-disponibilidad-y-citas',
  correos: 'correos-de-citas',
  crm: 'crm-leads-captura-de-oportunidades',
  agente: 'agente-conversion-y-agenda',
};

export const slug = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Textos largos que no están en Code nodes pero se reescriben igual.
const TEXTOS = [
  ['agente', 'Agente de clínica', (n) => n.parameters.options.systemMessage, 'system-message.txt'],
  ['agente', 'base_de_datos', (n) => n.parameters.toolDescription, 'base-de-datos.descripcion.txt'],
  ['crm', 'CRM IA - Clasificar mensaje', (n) => n.parameters.options.systemPromptTemplate, 'clasificador.system.txt'],
  ['crm', 'CRM IA - Clasificar mensaje', (n) => n.parameters.inputSchema, 'clasificador.schema.json'],
  ['crm', 'CRM IA - Clasificar mensaje', (n) => n.parameters.text, 'clasificador.text.txt'],
];

for (const [clave, archivo] of Object.entries(ORIGENES)) {
  const wf = JSON.parse(readFileSync(join(RAIZ, 'archivo', 'dulce-maria', 'workflows', `${archivo}.json`), 'utf8'));
  const dir = join(DESTINO, clave);
  mkdirSync(dir, { recursive: true });
  const lista = [];
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      writeFileSync(join(dir, `${slug(n.name)}.js`), n.parameters.jsCode);
      lista.push(`${slug(n.name)}.js ← ${n.name}`);
    }
    if (n.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {
      writeFileSync(join(dir, `tool-${slug(n.name)}.descripcion.txt`), n.parameters.description);
      lista.push(`tool-${slug(n.name)}.descripcion.txt ← ${n.name}`);
    }
  }
  for (const [c, nombre, sacar, destino] of TEXTOS) {
    if (c !== clave) continue;
    const nodo = wf.nodes.find((n) => n.name === nombre);
    writeFileSync(join(dir, destino), sacar(nodo));
    lista.push(`${destino} ← ${nombre}`);
  }
  console.log(`\n[${clave}] ${wf.name}\n  ${lista.join('\n  ')}`);
}
