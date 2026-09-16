# Archivo — Demo Clínica Dental Dulce María

Estado al **2026-09-11**, justo antes de que el número de WhatsApp pasara al demo de
**American Gym**. Nada de lo que está acá se borró: los workflows siguen en la instancia de n8n,
el Sheet y la carpeta del RAG siguen en Drive, y los vectores siguen en Postgres. Lo único que
cambia con el corte es a dónde apunta el webhook de Chatwoot.

Los JSON de `workflows/` son una **segunda red**, no la fuente para restaurar: la fuente es el
workflow en n8n. Van sin `pinData` y con el token de Chatwoot tachado (el repo tiene remoto).
Se regeneran con `node scripts/american-gym/archivar-dulce-maria.mjs`.

## Piezas

### n8n (`https://n8n.trignia.com`)

| Workflow | ID | Nodos | Estado al archivar |
|---|---|---|---|
| Agente conversión y agenda | `GmGt3g3krJCoDli0` | 61 | activo |
| Agenda — disponibilidad y citas | `LsbRqfF2c32hVahw` | 46 | activo |
| Clínica — Correos de citas | `JMZoI1W9QC16LdVK` | 6 | activo |
| CRM Leads — Captura de oportunidades (WhatsApp) | `W8A2NHCABxlNWCph` | 27 | activo |
| Agente conversión y agenda STAGING | `IkkbeA89F3e4wC0x` | 58 | inactivo |
| RAG Sync — Reconciliar Drive ↔ n8n_vectors | `p92vLPvE7MJZ0OYj` | 12 | activo, **compartido** con otros demos: no es de este archivo |

Webhooks de n8n: `/webhook/whatsapp-clinica-demo` (agente), `/webhook/agenda-test` (prueba del
motor), `/webhook/crm-leads-test-9f2a4c7e` (prueba del CRM). El staging escucha en
`/webhook/whatsapp-clinica-demo-staging`.

### Chatwoot (`https://whatsapp.trignia.com`)

- **Cuenta 2**, nombre original "Clínica Dental Dulce María".
- **Bandeja 7**, nombre original "Agente - Clínica Dental Dulce María". Canal `Channel::Whatsapp`,
  proveedor `whatsapp_cloud` (Meta), número **+506 6419-1107**.
- **Webhook #2** "n8n chatbot - Clínica Dental Dulce María" →
  `https://n8n.trignia.com/webhook/whatsapp-clinica-demo`, eventos `message_created` y
  `conversation_status_changed`.
- **Webhook #3** "test n8n - Clinica Dulce María" →
  `https://n8n.trignia.com/webhook/whatsapp-clinica-demo-staging`, mismos eventos. Apuntaba a un
  workflow inactivo, así que fallaba en cada mensaje; se borra en el corte y se recrea con estos
  datos si hace falta.
- Sin agent bots, etiquetas, respuestas rápidas, equipos ni atributos personalizados.

El perfil de WhatsApp del número (nombre visible "Horarios ministros", descripción de clínica
dental, vertical `HEALTH`) no se tocó.

### Datos

| Qué | Dónde |
|---|---|
| CRM | Google Sheet `CRM - demo` `1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA` |
| Documentos del RAG | Drive, carpeta "Agente - Clínica Dulce María" `1Tfe8bUGgG2yFB4gvo1kM0r-FsOoOuyCQ` (DM_01, DM_03, DM_04, DM_05, DM_06) |
| Vectores | Postgres `n8n_vectors`, `metadata->>'clinic_id' = 'clinica_dulce_maria'` |
| Memoria de chat | Postgres `n8n_chat_histories_clinica_dulce_maria` (`session_id` = teléfono) |
| Calendarios | 4 calendarios en `trigniaautomations@gmail.com`; sus ids están en `Profesionales!I2:I5` |

### Credenciales de n8n que usa

| ID | Nombre | Para qué |
|---|---|---|
| `OzuELp4CRMHcSYT8` | trignia automations account | Google Sheets |
| `dv8Iv9ky8MjgX5Cv` | Trignia automations email | Google Drive (RAG) |
| `PTFrwFEcqS8cEEKT` | Google Calendar account | Calendar |
| `JQv3rDJEhLKRGdQ7` | Gmail trignia automations | Correos y aviso de escalamiento |
| `8n0JOv3z7MfZzuM4` | trignia agentes | OpenAI (modelo y embeddings) |
| `ctiw7NSHBqX5YzqF` | My postgre database | Vectores y memoria |

El token de Chatwoot **no** es una credencial: está en texto plano en el nodo
`Configuración Clínica`, campo `token_chatwoot`.

## Cómo restaurarlo

1. En n8n, reactivar `GmGt3g3krJCoDli0`. Los sub-workflows (motor, correos, CRM) no necesitan
   estar activos para que el agente los llame; solo hacen falta activos para sus webhooks de
   prueba.
2. En Chatwoot, cuenta 2 → Integraciones → Webhooks, volver a apuntar el webhook del bot a
   `https://n8n.trignia.com/webhook/whatsapp-clinica-demo`, con los dos eventos.
3. Renombrar la cuenta y la bandeja con los nombres originales de arriba.
4. Si el agente del gimnasio sigue activo con su propio path, no choca: son paths distintos.

Si la reactivación falla, lo más probable es una credencial OAuth vencida: reconectarla en la
UI de n8n. Ver la memoria del proyecto sobre el incidente del 2026-08-05.

## Bugs conocidos que quedaron congelados a propósito

No se arreglaron acá para no tocar el archivo. Están arreglados en la versión de American Gym.

- **El CRM no registra ningún lead desde el cambio de modelo.** `CRM IA - Modelo clasificación`
  usa `gpt-5.6-luna` con `temperature: 0`, y ese modelo lo rechaza con un 400. Todas las
  ejecuciones del 2026-09-10 fallaron en `CRM IA - Clasificar mensaje`.
- **Una cita `Reprogramada` no bloquea su espacio.** `Calcular slots libres` solo cuenta como
  ocupadas las `Solicitada` y `Confirmada`.
- **"A las 6" sin a. m./p. m. se lee siempre como 18:00** (`Interpretar la fecha`): asume el
  horario 08–18 de la clínica.
- **El domingo está fijo como cerrado** en `Calcular slots libres`, sin mirar `horario_atencion`.
