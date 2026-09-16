// A qué demo apuntan los scripts. Se elige con la variable de entorno TENANT:
//   TENANT=american-gym node regresion.mjs
//
// Sin TENANT se usa `dulce-maria`, que es a lo que apuntaban todos los scripts antes de que
// existiera esto. Así ningún comando viejo cambia de destino sin que nadie lo pida.
export const TENANTS = {
  'dulce-maria': {
    nombre: 'Clínica Dental Dulce María',
    sid: '1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA',
    workflows: {
      agente: 'GmGt3g3krJCoDli0',
      motor: 'LsbRqfF2c32hVahw',
      correos: 'JMZoI1W9QC16LdVK',
      crm: 'W8A2NHCABxlNWCph',
    },
    webhooks: { agente: 'whatsapp-clinica-demo', motor: 'agenda-test' },
    tablaMemoria: 'n8n_chat_histories_clinica_dulce_maria',
    clinicId: 'clinica_dulce_maria',
    // Nombres de pestañas y columnas que difieren entre demos.
    pestañas: { clientes: 'Pacientes', profesionales: 'Profesionales', citas: 'Citas' },
  },
  'american-gym': {
    nombre: 'American Gym',
    sid: '1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY',
    // Creados por scripts/american-gym/clonar.mjs (ver scripts/american-gym/workflows.json).
    workflows: {
      agente: 'bNfwNLVIn3WPAquq',
      motor: 'vxjbcHiSr2fNeuLu',
      correos: 'KgRMl5NZ87melAi4',
      crm: 'ThFJLkJVpAI7nef4',
    },
    webhooks: { agente: 'whatsapp-american-gym', motor: 'agenda-test-american-gym' },
    tablaMemoria: 'n8n_chat_histories_american_gym',
    clinicId: 'american_gym',
    pestañas: { clientes: 'Clientes', profesionales: 'Entrenadores', citas: 'Citas' },
  },
};

export const TENANT = process.env.TENANT || 'dulce-maria';
if (!TENANTS[TENANT]) {
  throw new Error(`TENANT desconocido: "${TENANT}". Opciones: ${Object.keys(TENANTS).join(', ')}`);
}
export const T = TENANTS[TENANT];
