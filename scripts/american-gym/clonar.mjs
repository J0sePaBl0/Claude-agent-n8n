// Construye los 4 workflows de American Gym a partir del export de Dulce María.
//
//   node scripts/american-gym/clonar.mjs [correos|motor|crm|agente ...]
//
// - Fuente: `archivo/dulce-maria/workflows/*.json` (el export congelado, no la instancia).
// - Código y textos: `scripts/american-gym/code/**` y `cambios/american-gym/`.
// - Idempotente: la primera vez CREA cada workflow (inactivo) y guarda su id en
//   `workflows.json`; las siguientes lo ACTUALIZA con `guardar()`. Nunca toca los de Dulce
//   María: aborta si algún id de destino coincide con uno de ellos.
// - Orden fijo por dependencias de ids: correos → motor → crm → agente.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { n8n, guardar } from '../agenda/sheets.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const CODIGO = join(AQUI, 'code');
const REGISTRO = join(AQUI, 'workflows.json');

// ---------------------------------------------------------------- constantes
const DM = {
  sid: '1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA',
  carpetaRag: '1Tfe8bUGgG2yFB4gvo1kM0r-FsOoOuyCQ',
  workflows: { correos: 'JMZoI1W9QC16LdVK', motor: 'LsbRqfF2c32hVahw', crm: 'W8A2NHCABxlNWCph', agente: 'GmGt3g3krJCoDli0' },
};
const GYM = {
  sid: '1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY',
  carpetaRag: '1Iu6Zx-g1pX2N4g0_NKpXHPqs-2bUbwYS',
  clinicId: 'american_gym',
  tablaMemoria: 'n8n_chat_histories_american_gym',
};
const ARCHIVOS = {
  correos: 'correos-de-citas',
  motor: 'agenda-disponibilidad-y-citas',
  crm: 'crm-leads-captura-de-oportunidades',
  agente: 'agente-conversion-y-agenda',
};
const NOMBRES = {
  correos: ['Clínica — Correos de citas', 'American Gym — Correos de citas'],
  motor: ['Agenda — disponibilidad y citas', 'American Gym — Agenda (disponibilidad y citas)'],
  crm: ['CRM Leads — Captura de oportunidades (WhatsApp)', 'American Gym — CRM Leads'],
  agente: ['Agente conversión y agenda', 'American Gym — Agente WhatsApp'],
};
const WEBHOOKS = {
  'whatsapp-clinica-demo': 'whatsapp-american-gym',
  'agenda-test': 'agenda-test-american-gym',
  'crm-leads-test-9f2a4c7e': 'crm-leads-test-american-gym',
};
const TAGS = ['demo', 'american-gym'];
const SETTINGS_OK = ['executionOrder', 'timezone', 'errorWorkflow', 'executionTimeout',
  'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
  'saveManualExecutions', 'callerPolicy', 'callerIds'];

// Renombres de prosa y columnas para motor, CRM y correos. Son los mismos de
// renombrar-codigo.mjs: acá se aplican a los PARÁMETROS (nombres de nodos, mapeos de
// entradas, pestañas en URLs, notas), no solo al código.
const PROSA = [
  // Identificadores compuestos SIN `\b` inicial: son únicos, y dentro de una expresión pueden
  // venir pegados a un escape ('\nid_paciente: ' en la descripción del evento de Calendar).
  [/id_paciente\b/g, 'id_cliente'], [/id_profesional\b/g, 'id_entrenador'],
  [/profesionales_habilitados\b/g, 'entrenadores_habilitados'],
  [/profesional_asignado\b/g, 'entrenador_asignado'], [/id_tratamiento\b/g, 'id_membresia'],
  [/confirmada_por_paciente\b/g, 'confirmada_por_cliente'], [/nombre_paciente\b/g, 'nombre_cliente'],
  [/paciente_existente\b/g, 'cliente_existente'], [/email_paciente\b/g, 'email_cliente'],
  // Sin regla para "Dulce María": los comentarios del código la nombran a propósito ("en
  // Dulce María faltaba…"). El remitente del correo se cambia explícito en AJUSTES.correos.
  [/\bpacientes\b/g, 'clientes'], [/\bPacientes\b/g, 'Clientes'],
  [/\bpaciente\b/g, 'cliente'], [/\bPaciente\b/g, 'Cliente'],
  [/\bprofesionales\b/g, 'entrenadores'], [/\bProfesionales\b/g, 'Entrenadores'],
  [/\bprofesional\b/g, 'entrenador'], [/\bProfesional\b/g, 'Entrenador'],
  [/\bde la clínica\b/g, 'del gimnasio'], [/\ba la clínica\b/g, 'al gimnasio'],
  [/\bla clínica\b/g, 'el gimnasio'], [/\bLa clínica\b/g, 'El gimnasio'],
  [/\buna clínica\b/g, 'un gimnasio'], [/\bclínica dental\b/g, 'gimnasio'],
  [/\bclínica\b/g, 'gimnasio'], [/\bClínica\b/g, 'Gimnasio'],
];
const prosa = (s) => PROSA.reduce((t, [re, por]) => t.replace(re, por), s);

// Aplica `fn` a cada texto y a cada CLAVE del workflow ya parseado. No se hace sobre el JSON
// serializado porque ahí un salto de línea es "\n" literal y `\b` no ve la palabra que sigue
// ("\nid_paciente" quedaba sin cambiar). Las claves importan: los mapeos de entradas de un
// sub-workflow (`nombre_paciente`) y las `connections` están indexados por nombre.
function mapearTextos(valor, fn) {
  if (typeof valor === 'string') return fn(valor);
  if (Array.isArray(valor)) return valor.map((v) => mapearTextos(v, fn));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [fn(k), mapearTextos(v, fn)]));
  }
  return valor;
}

// En el agente la prosa NO se reemplaza a ciegas ("tono cercano y profesional" es un
// adjetivo): solo identificadores y nombres de nodos exactos.
const IDENTIFICADORES_AGENTE = [
  ['Configuración Clínica', 'Configuración del negocio'],
  ['Agente de clínica', 'Agente American Gym'],
  ['Notificar Cierre al Paciente', 'Notificar Cierre al Cliente'],
  ['n8n_chat_histories_clinica_dulce_maria', GYM.tablaMemoria],
  ['clinica_dulce_maria', GYM.clinicId],
  ['nombre_paciente', 'nombre_cliente'],
  ['trato_a_paciente', 'trato_a_cliente'],
  ['solicitud_paciente', 'solicitud_cliente'],
  ['tema_clinico_sensible', 'tema_salud_sensible'],
  ['respuesta_agente_clinica', 'respuesta_agente_gym'],
  ['clinica-dulce-maria-agente', 'american-gym-agente'],
  ['Agente - Clínica Dulce María ', 'Agente - American Gym'],
];

// ---------------------------------------------------------------- utilidades
const leer = (...p) => readFileSync(join(...p), 'utf8');
const slug = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const nodo = (wf, nombre) => {
  const n = wf.nodes.find((x) => x.name === nombre);
  if (!n) throw new Error(`${wf.name}: no existe el nodo "${nombre}"`);
  return n;
};
const reemplazarTodo = (wf, pares) => {
  let s = JSON.stringify(wf);
  for (const [de, a] of pares) s = s.split(de).join(a);
  return JSON.parse(s);
};
const registro = existsSync(REGISTRO) ? JSON.parse(leer(REGISTRO)) : {};
const guardarRegistro = () => writeFileSync(REGISTRO, JSON.stringify(registro, null, 2) + '\n');

function inyectarCodigo(wf, clave) {
  for (const n of wf.nodes) {
    if (n.type !== 'n8n-nodes-base.code') continue;
    const ruta = join(CODIGO, clave, `${slug(n.name)}.js`);
    if (!existsSync(ruta)) throw new Error(`falta el código de "${n.name}" en ${ruta}`);
    n.parameters.jsCode = leer(ruta);
  }
}

// ---------------------------------------------------------------- cola del motor
// Serializa las escrituras del motor (agendar/confirmar/cancelar/reagendar) con un turno en
// Postgres. Sin esto, dos reservas simultáneas leían el mismo estado de Citas y ambas pasaban
// el chequeo de cupo: una ráfaga de 16 pedidos metió 15 personas en una clase de 12, todas con
// el mismo id_cliente e ids de cita repetidos (2026-09-23). Google Sheets no tiene
// transacciones, así que el candado vive afuera.
//
// El turno se toma ANTES de "Leer todo el CRM", no solo alrededor del chequeo: los ids nuevos
// (CITA/CLI/ACT) salen de esa lectura, y leída fuera del turno quedaba vieja. Se libera
// después de "Respuesta", el único punto de salida. Las consultas (solo lectura) no esperan.
//
// Tomar = INSERT ... ON CONFLICT DO UPDATE WHERE vencido: atómico en Postgres, lo gana uno
// solo. Quien no lo gana espera 1 s y reintenta; `vence` (120 s) libera el turno de una
// ejecución que se cayó a mitad de camino. Tabla: scripts/american-gym/crear-tabla-turno.mjs.
const PG = { postgres: { id: 'ctiw7NSHBqX5YzqF', name: 'My postgre database' } };
const RECURSO_TURNO = 'american_gym';
const INTENTOS_TURNO = 120;   // ~2 min de espera como máximo antes de "agenda_ocupada"

function serializarEscrituras(wf) {
  const cond = (id, leftValue, operator, rightValue = '') => ({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id, leftValue, rightValue, operator }],
      combinator: 'and',
    },
    options: {},
  });
  const esVerdad = { type: 'boolean', operation: 'true', singleValue: true };
  const nuevos = [
    { id: 'turno-escribe', name: '¿Escribe?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-416, 320],
      parameters: cond('escribe-c',
        "={{ ['agendar', 'confirmar', 'cancelar', 'reagendar'].includes($('Normalizar entrada').first().json.accion) }}",
        esVerdad) },
    { id: 'turno-tomar', name: 'Tomar turno', type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position: [-192, 320],
      credentials: PG,
      parameters: { operation: 'executeQuery', options: { queryReplacement: '={{ $execution.id }}' },
        query: `WITH t AS (
  INSERT INTO agenda_turno (recurso, dueno, vence)
  VALUES ('${RECURSO_TURNO}', $1, now() + interval '120 seconds')
  ON CONFLICT (recurso) DO UPDATE SET dueno = EXCLUDED.dueno, vence = EXCLUDED.vence
    WHERE agenda_turno.vence < now() OR agenda_turno.dueno = EXCLUDED.dueno
  RETURNING dueno
)
SELECT count(*)::int AS tomado FROM t;` } },
    { id: 'turno-tomado', name: '¿Turno tomado?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [32, 320],
      parameters: cond('tomado-c', '={{ $json.tomado }}', { type: 'number', operation: 'equals' }, 1) },
    { id: 'turno-seguir', name: '¿Seguir esperando?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [256, 480],
      parameters: cond('seguir-c', `={{ $runIndex < ${INTENTOS_TURNO} }}`, esVerdad) },
    { id: 'turno-esperar', name: 'Esperar turno', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [32, 640],
      webhookId: randomUUID(),
      parameters: { resume: 'timeInterval', amount: 1, unit: 'seconds' } },
    { id: 'turno-ocupada', name: 'Agenda ocupada', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 480],
      parameters: { jsCode: '' } },
    { id: 'turno-liberar', name: 'Liberar turno', type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position: [4976, 64],
      credentials: PG,
      parameters: { operation: 'executeQuery', options: { queryReplacement: '={{ $execution.id }}' },
        query: `WITH d AS (
  DELETE FROM agenda_turno WHERE recurso = '${RECURSO_TURNO}' AND dueno = $1 RETURNING 1
)
SELECT count(*)::int AS liberado FROM d;` } },
    { id: 'turno-devolver', name: 'Devolver respuesta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [5200, 64],
      parameters: { jsCode: '' } },
  ];
  wf.nodes.push(...nuevos);

  // Con las escrituras en fila, una ráfaga de reservas agota la cuota de Sheets (60 lecturas
  // por minuto): el 429 tumbó "Guardar cliente" DESPUÉS de "Escribir cita" y dejó una cita sin
  // ficha que el cliente vio como error (2026-09-23). 5 intentos x 5 s (el tope de n8n) cubren
  // media ventana de cuota. "Escribir cita" sigue sin reintentos: su append no es idempotente.
  for (const n of wf.nodes) {
    if (n.retryOnFail && (n.type === 'n8n-nodes-base.googleSheets' || n.type === 'n8n-nodes-base.httpRequest')) {
      n.maxTries = 5;
      n.waitBetweenTries = 5000;
    }
  }

  const a = (node) => ({ node, type: 'main', index: 0 });
  const c = wf.connections;
  if (JSON.stringify(c['Normalizar entrada']) !== JSON.stringify({ main: [[a('Leer todo el CRM')]] })) {
    throw new Error('motor: "Normalizar entrada" ya no va directo a "Leer todo el CRM"; revisar la cola');
  }
  if (c.Respuesta) throw new Error('motor: "Respuesta" ya tiene salidas; revisar la cola');
  c['Normalizar entrada'] = { main: [[a('¿Escribe?')]] };
  c['¿Escribe?'] = { main: [[a('Tomar turno')], [a('Leer todo el CRM')]] };
  c['Tomar turno'] = { main: [[a('¿Turno tomado?')]] };
  c['¿Turno tomado?'] = { main: [[a('Leer todo el CRM')], [a('¿Seguir esperando?')]] };
  c['¿Seguir esperando?'] = { main: [[a('Esperar turno')], [a('Agenda ocupada')]] };
  c['Esperar turno'] = { main: [[a('Tomar turno')]] };
  c['Agenda ocupada'] = { main: [[a('Respuesta')]] };
  c.Respuesta = { main: [[a('Liberar turno')]] };
  c['Liberar turno'] = { main: [[a('Devolver respuesta')]] };
}

// ---------------------------------------------------------------- por workflow
const AJUSTES = {
  correos(wf) {
    inyectarCodigo(wf, 'correos');
    wf = mapearTextos(wf, prosa);
    nodo(wf, 'Enviar correo al cliente').parameters.options.senderName = 'American Gym';
    return wf;
  },

  motor(wf) {
    serializarEscrituras(wf);
    inyectarCodigo(wf, 'motor');
    // Entrada nueva: el nombre completo que el cliente le DICTA al agente. Va aparte de
    // `nombre_cliente` (el del perfil de WhatsApp) porque tienen prioridades distintas:
    // "Validar reglas" escribe en Clientes el dictado antes que el de la hoja, y el del
    // perfil solo como último recurso.
    nodo(wf, 'Cuando el agente llama').parameters.workflowInputs.values.push({ name: 'nombre_dictado' });
    nodo(wf, 'Normalizar entrada').parameters.assignments.assignments.push({
      id: 'ne-nombre_dictado',
      name: 'nombre_dictado',
      type: 'string',
      value: "={{ $json.body ? ($json.body.nombre_dictado || '') : ($json.nombre_dictado || '') }}",
    });
    // Entrada nueva: CUÁL cita mover al reagendar. `fecha_texto` ahí es el destino, así que la
    // cita de origen no tenía por dónde llegar (caso 7.3 del retest).
    nodo(wf, 'Cuando el agente llama').parameters.workflowInputs.values.push({ name: 'cita_a_mover' });
    nodo(wf, 'Normalizar entrada').parameters.assignments.assignments.push({
      id: 'ne-cita_a_mover',
      name: 'cita_a_mover',
      type: 'string',
      value: "={{ $json.body ? ($json.body.cita_a_mover || '') : ($json.cita_a_mover || '') }}",
    });
    wf = reemplazarTodo(wf, [[DM.workflows.correos, registro.correos], [NOMBRES.correos[0], NOMBRES.correos[1]]]);
    wf = mapearTextos(wf, prosa);
    nodo(wf, 'Documentación').parameters.content = leer(AQUI, 'notas', 'motor.md');
    return wf;
  },

  crm(wf) {
    inyectarCodigo(wf, 'crm');
    const clasificar = nodo(wf, 'CRM IA - Clasificar mensaje');
    clasificar.parameters.text = leer(CODIGO, 'crm', 'clasificador.text.txt');
    clasificar.parameters.inputSchema = leer(CODIGO, 'crm', 'clasificador.schema.json');
    clasificar.parameters.options.systemPromptTemplate = leer(CODIGO, 'crm', 'clasificador.system.txt');
    // gpt-5.6-luna rechaza `temperature` con un 400 y el CRM no registraba ningún lead.
    delete nodo(wf, 'CRM IA - Modelo clasificación').parameters.options.temperature;
    wf = mapearTextos(wf, prosa);
    return wf;
  },

  async agente(wf) {
    inyectarCodigo(wf, 'agente');
    wf = reemplazarTodo(wf, [
      [DM.workflows.motor, registro.motor], [NOMBRES.motor[0], NOMBRES.motor[1]],
      [DM.workflows.crm, registro.crm], [NOMBRES.crm[0], NOMBRES.crm[1]],
      ...IDENTIFICADORES_AGENTE,
    ]);

    // --- configuración del negocio: sin token (va a una credencial) y con los datos del gym
    const cfg = nodo(wf, 'Configuración del negocio').parameters.assignments.assignments;
    const CAMBIOS_CFG = {
      nombre: 'American Gym',
      especialidad: 'gimnasio',
      // El horario del gimnasio: Lun-Vie 05:00-21:00, Sáb 07:00-15:00, Dom 09:00-13:00.
      // "Determinar Mensaje por Horario" solo admite UNA ventana para toda la semana, así que
      // se toma la franja en la que seguro hay alguien en recepción los siete días.
      // PENDIENTE: confirmar con el gimnasio el horario real de atención HUMANA por WhatsApp.
      horario_dias: 'lunes a domingo',
      horario_inicio: '07:00',
      horario_fin: '20:00',
      trato_a_cliente: 'usted',
      idioma: 'español e inglés',
      // Ya no gobierna el tono: las reglas de voz viven en el system message (secciones
      // "ESTILO Y FORMATO" y "ASÍ NO / ASÍ SÍ"). Queda acá solo para que quien abra este Set
      // en la UI no crea que cambiando este valor cambia cómo habla el agente.
      tono: 'cálido neutro, de usted, sin muletillas regionales '
        + '(las reglas de voz están en el system message, no acá)',
      // Las dos de escalamiento son lo ÚLTIMO que el cliente lee antes de que "Preparar
      // Mensaje Final" descarte lo que escribió el agente: tienen que sonar a persona, no a
      // acuse de recibo. Sin exclamaciones ni "con mucho gusto": la misma línea sale para
      // una consulta de horarios y para alguien que acaba de describir un dolor en el pecho.
      mensaje_escalamiento_dentro_horario: 'Ya le aviso a una persona del equipo para que le '
        + 'ayude; en unos minutos le escribe por aquí mismo.',
      // La frase del 9-1-1 tapa un hueco real: fuera de horario, ante una señal de alarma
      // de salud el prompt le ordena al agente decir "busque atención médica de inmediato",
      // pero "Preparar Mensaje Final" reemplaza esa respuesta por esta línea enlatada. Sin
      // la cláusula, ese aviso se perdía entero cuando la señal de alarma llegaba de noche.
      mensaje_escalamiento_fuera_horario: 'Recibimos su mensaje. A esta hora no hay nadie '
        + 'en recepción, pero una persona del equipo le escribe por aquí apenas abramos. Si '
        + 'se trata de una urgencia de salud, por favor no espere: llame al 9-1-1 o acuda '
        + 'al servicio médico más cercano.',
      // Lo dispara una persona al resolver la conversación en Chatwoot, no el agente: por
      // eso mantiene el plural ("le dejamos", "le ayudamos"), la voz del equipo.
      mensaje_cierre: 'Le dejamos su caso como resuelto. Cualquier cosa que necesite, '
        + 'escríbanos por aquí, que con mucho gusto le ayudamos. ¡Que le vaya muy bien y '
        + 'nos vemos en el gimnasio!',
    };
    for (const a of cfg) if (a.name in CAMBIOS_CFG) a.value = CAMBIOS_CFG[a.name];
    nodo(wf, 'Configuración del negocio').parameters.assignments.assignments =
      cfg.filter((a) => a.name !== 'token_chatwoot');

    // --- los 5 nodos HTTP de Chatwoot autentican con credencial, no con el token del Set
    const credChatwoot = { httpHeaderAuth: { id: registro.credencialChatwoot, name: 'Chatwoot API — trignia' } };
    for (const nombre of ['Respuesta', 'Consultar Estado Conversación', 'Cambiar Estado a Pending',
      'Nota Privada de Escalamiento', 'Notificar Cierre al Cliente']) {
      const n = nodo(wf, nombre);
      const cabeceras = (n.parameters.headerParameters?.parameters || [])
        .filter((h) => h.name !== 'api_access_token');
      if (cabeceras.length) n.parameters.headerParameters.parameters = cabeceras;
      else { delete n.parameters.headerParameters; n.parameters.sendHeaders = false; }
      n.parameters.authentication = 'genericCredentialType';
      n.parameters.genericAuthType = 'httpHeaderAuth';
      n.credentials = credChatwoot;
    }
    if (JSON.stringify(wf).includes('token_chatwoot')) throw new Error('quedó una referencia a token_chatwoot');

    // --- prompt, descripciones y esquema de salida
    nodo(wf, 'Agente American Gym').parameters.options.systemMessage =
      leer(RAIZ, 'cambios', 'american-gym', 'system-message-agente-gym.txt').replace(/\n$/, '');
    nodo(wf, 'base_de_datos').parameters.toolDescription = leer(CODIGO, 'agente', 'base-de-datos.descripcion.txt').trim();
    for (const t of ['consultar_disponibilidad', 'agendar_cita', 'confirmar_cita', 'cancelar_cita', 'reagendar_cita']) {
      nodo(wf, t).parameters.description = leer(CODIGO, 'agente', `tool-${slug(t)}.descripcion.txt`).trim();
      // Los $fromAI también hablan de "paciente" y del cargo de la clínica.
      const v = nodo(wf, t).parameters.workflowInputs.value;
      for (const k of Object.keys(v)) {
        v[k] = v[k].replace(/\bPACIENTE\b/g, 'CLIENTE').replace(/\bpaciente\b/g, 'cliente');
      }
      if (t === 'reagendar_cita') {
        // CUÁL cita mover: `fecha_texto` es el destino y no alcanzaba (caso 7.3 del retest).
        v.cita_a_mover = `={{ $fromAI('cita_a_mover', "LAS PALABRAS DEL CLIENTE que dicen CUÁL cita quiere mover (el servicio o el día de la cita que YA tiene), copiadas tal cual: \\"la de yoga\\", \\"la del martes\\". NO es el destino. Vacío si tiene una sola cita o no dijo cuál.", 'string') }}`;
        nodo(wf, t).parameters.workflowInputs.schema.push({ id: 'cita_a_mover', displayName: 'cita_a_mover',
          required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' });
      }
    }
    // --- herramienta NUEVA: `mis_citas`, de solo lectura
    // Sin ella no había forma de contestar "¿qué citas tengo?" sin efectos: las de gestión
    // confirman o cancelan de verdad. En las pruebas del 2026-09-16 el modelo lo contestó de
    // memoria. Se arma clonando `confirmar_cita`, que ya tiene la forma y el id del motor.
    const misCitas = JSON.parse(JSON.stringify(nodo(wf, 'confirmar_cita')));
    misCitas.id = 'tool-mis-citas';
    misCitas.name = 'mis_citas';
    misCitas.position = [nodo(wf, 'confirmar_cita').position[0], nodo(wf, 'confirmar_cita').position[1] + 176];
    misCitas.parameters.description = leer(CODIGO, 'agente', 'tool-mis-citas.descripcion.txt').trim();
    // Solo teléfono: no le pide NADA al modelo, así que no hay nada que pueda inventar.
    misCitas.parameters.workflowInputs.value = {
      accion: 'consultar_citas',
      telefono: nodo(wf, 'confirmar_cita').parameters.workflowInputs.value.telefono,
    };
    misCitas.parameters.workflowInputs.schema = misCitas.parameters.workflowInputs.schema
      .filter((c) => ['accion', 'telefono'].includes(c.id));
    wf.nodes.push(misCitas);
    wf.connections.mis_citas = { ai_tool: [[{ node: 'Agente American Gym', type: 'ai_tool', index: 0 }]] };

    // `agendar_cita` es la única que pide el nombre: es el turno en que se crea la ficha
    // del cliente en Clientes. Las otras tres localizan la cita por teléfono.
    // El `schema` del mapeador tiene que listar la entrada nueva: es lo que la UI (y el
    // nodo) usan para saber qué campos existen en el sub-workflow.
    nodo(wf, 'agendar_cita').parameters.workflowInputs.schema.push({
      id: 'nombre_dictado', displayName: 'nombre_dictado', required: false,
      defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string',
    });
    nodo(wf, 'agendar_cita').parameters.workflowInputs.value.nombre_dictado =
      "={{ $fromAI('nombre_dictado', \"El nombre completo del cliente, tal como lo dictó en la conversación. Dejalo vacío si no lo dio o si no lo dijo él mismo: NUNCA pongas acá el nombre del perfil de WhatsApp ni uno que hayas deducido.\", 'string') }}";

    // --- quién escribe, antes de que el agente hable
    // El saludo pasa antes de cualquier herramienta, así que el nombre real tiene que estar
    // resuelto ya en el primer mensaje. Cuelga de "¿Bot Puede Responder?" para no gastar una
    // lectura de Sheets cuando la conversación la tiene una persona.
    const codigoTv = wf.nodes.find((n) => n.type === 'n8n-nodes-base.code').typeVersion;
    wf.nodes.push({
      parameters: {
        url: `https://sheets.googleapis.com/v4/spreadsheets/${GYM.sid}/values/Clientes!A%3AQ`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        options: {},
      },
      id: 'buscar-cliente-registrado',
      name: 'Buscar cliente registrado',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [352, -160],
      credentials: nodo(wf, 'catalogo_servicios').credentials,
      executeOnce: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
      // Si Google falla, el cliente se queda sin nombre, nunca sin respuesta.
      onError: 'continueRegularOutput',
    }, {
      parameters: { jsCode: leer(CODIGO, 'agente', 'cliente-registrado.js') },
      id: 'cliente-registrado',
      name: 'Cliente registrado',
      type: 'n8n-nodes-base.code',
      typeVersion: codigoTv,
      position: [560, -160],
    });
    const salida = (destino) => ({ main: [[{ node: destino, type: 'main', index: 0 }]] });
    wf.connections['¿Bot Puede Responder?'] = salida('Buscar cliente registrado');
    wf.connections['Buscar cliente registrado'] = salida('Cliente registrado');
    wf.connections['Cliente registrado'] = salida('Agente American Gym');

    const modelo = nodo(wf, 'OpenAI Chat Model2');
    const esquema = JSON.parse(modelo.parameters.options.textFormat.textOptions.schema);
    esquema.properties.respuesta.description = 'Mensaje para el cliente, en su idioma, sin markdown. '
      + 'Siempre se redacta, incluso al escalar.';
    modelo.parameters.options.textFormat.textOptions.schema = JSON.stringify(esquema, null, 2);
    modelo.name = 'Modelo del agente (OpenAI)';

    // --- webhook de Chatwoot, carpeta del RAG y aviso por correo
    wf = reemplazarTodo(wf, [
      [DM.carpetaRag, GYM.carpetaRag],
      ['"OpenAI Chat Model2"', '"Modelo del agente (OpenAI)"'],
    ]);
    const aviso = nodo(wf, 'Send a message');
    aviso.parameters.subject = 'Escalamiento humano - American Gym - Atención requerida';
    aviso.parameters.message = aviso.parameters.message
      .replace(/Un paciente requiere/g, 'Un cliente requiere')
      .replace(/>Paciente</g, '>Cliente<')
      .replace(/mensaje del paciente/g, 'mensaje del cliente');
    aviso.name = 'Avisar escalamiento por correo';
    wf = reemplazarTodo(wf, [['"Send a message"', '"Avisar escalamiento por correo"']]);

    // --- notas: la de escalamiento se adapta; la de leads apunta al CRM nuevo
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.stickyNote')) {
      n.parameters.content = prosa(n.parameters.content || '');
    }
    return wf;
  },
};

// ---------------------------------------------------------------- común
function comun(wf, clave) {
  // Metadatos del export de Dulce María que no viajan al workflow nuevo.
  for (const k of ['id', 'active', 'activeVersionId', 'updatedAt', 'tags']) delete wf[k];
  wf.name = NOMBRES[clave][1];
  // En las notas, los ids de Dulce María se cambian por el nombre del workflow del gimnasio:
  // al crear `correos`, el motor nuevo todavía no tiene id.
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.stickyNote')) {
    for (const [k, idDm] of Object.entries(DM.workflows)) {
      n.parameters.content = (n.parameters.content || '').split(idDm).join(NOMBRES[k][1]);
    }
  }
  for (const n of wf.nodes) {
    if (n.webhookId) n.webhookId = randomUUID();                  // ids de webhook únicos
    if (n.parameters?.path && WEBHOOKS[n.parameters.path]) n.parameters.path = WEBHOOKS[n.parameters.path];
    // El nombre en caché del Sheet se ve en la UI de n8n.
    if (n.parameters?.documentId?.cachedResultName) n.parameters.documentId.cachedResultName = 'CRM - American Gym';
  }
  // Parámetros por defecto explícitos (CLAUDE.md): Gmail y Calendar funcionaban con el valor
  // por defecto de `operation`, pero el validador lo marca como error y un cambio de versión
  // del nodo podría cambiar ese defecto.
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.gmail' && !n.parameters.operation) {
      n.parameters = { resource: 'message', operation: 'send', ...n.parameters };
    }
    if (n.type === 'n8n-nodes-base.googleCalendar' && !n.parameters.operation) {
      n.parameters = { resource: 'event', operation: 'create', ...n.parameters };
    }
  }
  wf = reemplazarTodo(wf, [[DM.sid, GYM.sid]]);
  wf.settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_OK.includes(k)));
  if (!wf.settings.timezone) wf.settings.timezone = 'America/Costa_Rica';

  // Candados: nada de Dulce María puede quedar vivo en un workflow del gimnasio.
  const s = JSON.stringify(wf);
  for (const [que, valor] of [['Sheet', DM.sid], ['carpeta RAG', DM.carpetaRag],
    ...Object.entries(DM.workflows).map(([k, v]) => [`workflow ${k}`, v]),
    ['webhook', '"whatsapp-clinica-demo"'], ['memoria', 'clinica_dulce_maria']]) {
    if (s.includes(valor)) throw new Error(`${wf.name}: quedó una referencia a ${que} de Dulce María (${valor})`);
  }
  return wf;
}

async function asegurarTags() {
  const existentes = (await n8n('/tags?limit=100')).data;
  const ids = [];
  for (const nombre of TAGS) {
    const t = existentes.find((x) => x.name === nombre) || await n8n('/tags', { method: 'POST', body: { name: nombre } });
    ids.push({ id: t.id });
  }
  return ids;
}

async function asegurarCredencialChatwoot() {
  if (registro.credencialChatwoot) return;
  // El valor sale de la instancia (del Set del agente de Dulce María), nunca del repo.
  const dm = await n8n(`/workflows/${DM.workflows.agente}`);
  const token = nodo(dm, 'Configuración Clínica').parameters.assignments.assignments
    .find((a) => a.name === 'token_chatwoot')?.value;
  if (!token) throw new Error('no encontré token_chatwoot en el agente de Dulce María');
  const cred = await n8n('/credentials', { method: 'POST', body: {
    name: 'Chatwoot API — trignia', type: 'httpHeaderAuth', data: { name: 'api_access_token', value: token },
  } });
  registro.credencialChatwoot = cred.id;
  guardarRegistro();
  console.log(`credencial creada: Chatwoot API — trignia (${cred.id})`);
}

// ---------------------------------------------------------------- main
// --seco=<carpeta>: arma los JSON y los escribe ahí, sin tocar n8n. Los ids que todavía no
// existen van como `SECO-<clave>`.
const ORDEN = ['correos', 'motor', 'crm', 'agente'];
const argSeco = process.argv.find((a) => a.startsWith('--seco='));
const SECO = argSeco ? argSeco.split('=')[1] : null;
const pedidosArg = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pedidos = pedidosArg.length ? pedidosArg : ORDEN;
if (SECO) {
  for (const c of [...ORDEN, 'credencialChatwoot']) if (!registro[c]) registro[c] = `SECO-${c}`;
}
const tags = SECO ? [] : await asegurarTags();

for (const clave of ORDEN.filter((c) => pedidos.includes(c))) {
  if (clave === 'motor' && !registro.correos) throw new Error('primero hay que crear correos');
  if (clave === 'agente' && (!registro.motor || !registro.crm)) throw new Error('primero hay que crear motor y crm');
  if (clave === 'agente' && !SECO) await asegurarCredencialChatwoot();

  let wf = JSON.parse(leer(RAIZ, 'archivo', 'dulce-maria', 'workflows', `${ARCHIVOS[clave]}.json`));
  wf = await AJUSTES[clave](wf);
  wf = comun(wf, clave);

  const cuerpo = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
  if (SECO) {
    writeFileSync(join(SECO, `${clave}.json`), JSON.stringify(cuerpo, null, 2));
    console.log(`seco ${clave}: ${wf.nodes.length} nodos → ${join(SECO, `${clave}.json`)}`);
    continue;
  }
  let id = registro[clave];
  if (Object.values(DM.workflows).includes(id)) throw new Error(`candado: ${id} es un workflow de Dulce María`);
  if (id) {
    await guardar(id, cuerpo);
    console.log(`actualizado ${clave}: ${id}  ${wf.name}`);
  } else {
    id = (await n8n('/workflows', { method: 'POST', body: cuerpo })).id;
    registro[clave] = id;
    guardarRegistro();
    console.log(`creado ${clave}: ${id}  ${wf.name}`);
  }
  await n8n(`/workflows/${id}/tags`, { method: 'PUT', body: tags });
}
