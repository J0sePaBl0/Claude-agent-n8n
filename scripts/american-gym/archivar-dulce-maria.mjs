// Exporta a git los workflows del demo Dulce María antes de que el número pase a American Gym.
//   node scripts/american-gym/archivar-dulce-maria.mjs
//
// Solo LEE de n8n. La copia que sirve para restaurar es el workflow mismo, que queda en la
// instancia desactivado; este export es la segunda red, para poder ver qué había aunque
// alguien lo toque allá.
//
// Se omiten `pinData` (payloads reales con teléfonos) y los secretos que el demo guarda en
// texto plano dentro de nodos Set: el repo tiene remoto en GitHub.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { n8n } from '../agenda/sheets.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESTINO = join(RAIZ, 'archivo', 'dulce-maria', 'workflows');

const WORKFLOWS = {
  GmGt3g3krJCoDli0: 'agente-conversion-y-agenda',
  LsbRqfF2c32hVahw: 'agenda-disponibilidad-y-citas',
  JMZoI1W9QC16LdVK: 'correos-de-citas',
  W8A2NHCABxlNWCph: 'crm-leads-captura-de-oportunidades',
  IkkbeA89F3e4wC0x: 'agente-conversion-y-agenda-staging',
};

// Campos de nodos Set cuyo valor es un secreto. Se reemplaza el valor, no se borra el campo,
// para que el JSON siga mostrando que el nodo lo necesita.
const CAMPOS_SECRETOS = ['token_chatwoot'];
const TACHADO = '<REDACTADO — el valor real vive en el workflow de n8n>';

function redactar(wf) {
  const secretos = [];
  for (const nodo of wf.nodes) {
    const asignaciones = nodo.parameters?.assignments?.assignments || [];
    for (const a of asignaciones) {
      if (CAMPOS_SECRETOS.includes(a.name) && a.value && !String(a.value).startsWith('=')) {
        secretos.push(String(a.value));
        a.value = TACHADO;
      }
    }
  }
  return secretos;
}

mkdirSync(DESTINO, { recursive: true });
const todosLosSecretos = new Set();
const resumen = [];

for (const [id, archivo] of Object.entries(WORKFLOWS)) {
  const wf = await n8n(`/workflows/${id}`);
  redactar(wf).forEach((s) => todosLosSecretos.add(s));

  const limpio = {
    id: wf.id,
    name: wf.name,
    active: wf.active,
    updatedAt: wf.updatedAt,
    activeVersionId: wf.activeVersionId ?? null,
    tags: (wf.tags || []).map((t) => t.name),
    settings: wf.settings,
    nodes: wf.nodes,
    connections: wf.connections,
  };
  const texto = JSON.stringify(limpio, null, 2);

  // Última defensa: ningún secreto conocido puede quedar en ningún rincón del JSON.
  for (const s of todosLosSecretos) {
    if (texto.includes(s)) throw new Error(`${archivo}: quedó un secreto sin tachar`);
  }

  writeFileSync(join(DESTINO, `${archivo}.json`), texto + '\n');
  resumen.push(`${id}  ${wf.active ? 'activo  ' : 'inactivo'}  ${String(wf.nodes.length).padStart(2)} nodos  ${wf.name}`);
}

console.log(resumen.join('\n'));
console.log(`\n${todosLosSecretos.size} secreto(s) tachado(s). Export en ${DESTINO}`);
