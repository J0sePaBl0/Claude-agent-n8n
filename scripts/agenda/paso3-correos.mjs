// Paso 3 — workflow "Clínica — Correos de citas".
//
// Lo llama el motor de agenda al final de agendar, cancelar y reagendar. Tres tipos de
// correo: `nueva`, `reprogramada`, `cancelada`.
//
// NO hay correo de confirmación ni botones de gestión: por decisión del proyecto la
// confirmación vive ÚNICAMENTE en WhatsApp. El correo avisa, no actúa. Eso evita el
// formulario público, el token en los enlaces y dos caminos que puedan contradecirse.
//
// Idempotente: si el workflow ya existe (por nombre), lo actualiza por PUT.
//
//   node paso3-correos.mjs            ensayo
//   node paso3-correos.mjs --apply    crea o actualiza
import { readFileSync } from 'node:fs';
import { n8n, guardar } from './sheets.mjs';

const NOMBRE = 'Clínica — Correos de citas';
const CRED_GMAIL = { gmailOAuth2: { id: 'JQv3rDJEhLKRGdQ7', name: 'Gmail trignia automations' } };
const APLICAR = process.argv.includes('--apply');

const ENTRADAS = ['tipo', 'email', 'nombre_paciente', 'servicio', 'texto_cita', 'profesional',
  'id_cita', 'nota', 'texto_anterior', 'sede_nombre', 'sede_direccion', 'sede_link_maps',
  'sede_telefono', 'sede_whatsapp'];

const nodes = [
  {
    id: 'corr-trigger',
    name: 'Cuando el motor llama',
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position: [0, 0],
    parameters: { workflowInputs: { values: ENTRADAS.map((name) => ({ name })) } },
  },
  {
    id: 'corr-if',
    name: '¿Hay a quién escribirle?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [240, 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [
          {
            id: 'c-email',
            leftValue: '={{ ($json.email || "").trim() }}',
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty', singleValue: true },
          },
          {
            id: 'c-tipo',
            leftValue: '={{ ($json.tipo || "").trim() }}',
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  },
  {
    id: 'corr-armar',
    name: 'Armar correo',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [480, -100],
    parameters: { mode: 'runOnceForAllItems', jsCode: readFileSync('code/correo-cita.js', 'utf8') },
  },
  {
    id: 'corr-enviar',
    name: 'Enviar correo al paciente',
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2.2,
    position: [720, -100],
    // El correo es un aviso, no la fuente de verdad: la cita ya quedó escrita en el Sheet
    // antes de llegar acá. Si Gmail falla, no se debe tumbar la gestión.
    onError: 'continueRegularOutput',
    retryOnFail: true,
    parameters: {
      sendTo: '={{ $json.para }}',
      subject: '={{ $json.asunto }}',
      message: '={{ $json.html }}',
      options: {
        appendAttribution: false,
        senderName: 'Clínica Dental Dulce María',
      },
    },
    credentials: CRED_GMAIL,
  },
  {
    id: 'corr-noop',
    name: 'Sin correo del paciente',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [480, 100],
    parameters: {},
  },
  {
    id: 'corr-nota',
    name: 'Documentación',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [-40, -420],
    parameters: {
      height: 360,
      width: 760,
      content: `## Clínica — Correos de citas

Sub-workflow de aviso. Lo llama **Agenda — disponibilidad y citas** (\`LsbRqfF2c32hVahw\`)
desde el nodo \`Enviar correo de la cita\`, con \`waitForSubWorkflow: false\`: el paciente
recibe su respuesta en WhatsApp sin esperar a Gmail.

**Tipos:** \`nueva\` · \`reprogramada\` · \`cancelada\`.

**No existe un correo de confirmación, y es a propósito.** La confirmación vive
ÚNICAMENTE en WhatsApp (tool \`confirmar_cita\` del agente). Por eso estos correos no
llevan botones de Confirmar / Reagendar / Cancelar: avisan y empujan a WhatsApp. Sin
botones no hace falta el \`token_gestion\` en los enlaces ni un formulario público.

**Si el paciente no dio correo**, \`email\` llega vacío y el IF corta: la gestión ya se
completó igual en el Sheet. El correo nunca es un requisito para agendar.

⚠️ Sale de \`trigniaautomations@gmail.com\`, no de un dominio de la clínica. Se mitiga con
el nombre visible del remitente. Cambiar eso exige un dominio propio en Gmail.`,
    },
  },
];

const connections = {
  'Cuando el motor llama': { main: [[{ node: '¿Hay a quién escribirle?', type: 'main', index: 0 }]] },
  '¿Hay a quién escribirle?': {
    main: [
      [{ node: 'Armar correo', type: 'main', index: 0 }],
      [{ node: 'Sin correo del paciente', type: 'main', index: 0 }],
    ],
  },
  'Armar correo': { main: [[{ node: 'Enviar correo al paciente', type: 'main', index: 0 }]] },
};

// Un error de sintaxis en el Code node no se ve hasta que un paciente lo dispara.
try {
  // eslint-disable-next-line no-new-func
  new Function('$input', nodes.find((n) => n.name === 'Armar correo').parameters.jsCode);
  console.log('✓ code/correo-cita.js compila');
} catch (e) {
  throw new Error(`sintaxis inválida en correo-cita.js: ${e.message}`);
}

const lista = await n8n('/workflows?limit=250');
const existente = lista.data.find((w) => w.name === NOMBRE);
const settings = { executionOrder: 'v1', timezone: 'America/Costa_Rica' };

if (!APLICAR) {
  console.log(existente
    ? `Ensayo: actualizaría ${existente.id} (${nodes.length} nodos).`
    : `Ensayo: crearía "${NOMBRE}" (${nodes.length} nodos).`);
  process.exit(0);
}

if (existente) {
  await guardar(existente.id, { name: NOMBRE, nodes, connections, settings });
  console.log(`✓ actualizado ${existente.id}`);
} else {
  const creado = await n8n('/workflows', {
    method: 'POST',
    body: { name: NOMBRE, nodes, connections, settings },
  });
  console.log(`✓ creado ${creado.id}`);
  console.log('\n>>> Pegá este id en paso3-motor.mjs: ' + creado.id);
}
