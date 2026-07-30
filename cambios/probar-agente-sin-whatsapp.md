# Probar el agente sin mandar WhatsApp desde el teléfono

Cómo disparar el workflow `Agente conversión y agenda` (`GmGt3g3krJCoDli0`) simulando un
mensaje de Chatwoot, leer lo que contestó, y dejar la conversación limpia entre pruebas.

> **Por qué hace falta esto:** la API pública de n8n **no ejecuta workflows**. La única vía
> sin abrir la UI es hacerle POST al webhook de producción con un payload de Chatwoot armado
> a mano. El workflow no valida la firma `x-chatwoot-signature`, así que un POST directo pasa.

---

## Lo que tenés que saber antes

| Dato | Valor |
|---|---|
| Webhook de producción | `https://n8n.trignia.com/webhook/whatsapp-clinica-demo` |
| Chatwoot | `https://whatsapp.trignia.com/`, cuenta `2` |
| Conversación de prueba | `10` (contacto "Jp", `+50660181661`) |
| Token de Chatwoot | está en el nodo `Configuración Clínica`, campo `token_chatwoot` (`cfg-0002`) |

**Tres efectos secundarios reales.** Esto no es un sandbox:

1. **Le llega un WhatsApp de verdad** al número de la conversación. Usá siempre la
   conversación de prueba, nunca la de un paciente.
2. **Se crea un lead en el CRM.** El nodo `CRM - Enviar a captura de leads` corre antes del
   agente, así que cada mensaje de prueba escribe una fila en `Interacciones` y puede abrir
   o mover una oportunidad en `Oportunidades` del Sheet `CRM - demo`. Si estás probando
   mucho, después hay que limpiar esas filas a mano.
3. **Se acumulan ejecuciones** en el historial de n8n.

---

## El gotcha que más tiempo hace perder

El guardia `¿Bot Puede Responder?` solo deja pasar conversaciones con `status = open`.

Cualquier escalamiento —real o por un bug— pone la conversación en `pending` con
`Cambiar Estado a Pending`. **A partir de ahí el bot no vuelve a contestar nunca**, por más
que arregles el workflow. La ejecución dura ~100 ms y muere en el `If` del guardia.

Si estás depurando y "no responde", lo primero que hay que mirar es el `status` de la
conversación, no el agente.

---

## 1. Mandar un mensaje

Guardá esto como `probar.mjs`:

```js
// node probar.mjs "cuanto cuesta una limpieza?"
const CONTENIDO = process.argv[2] || 'hola';
const ahora = Math.floor(Date.now() / 1000);
const iso = new Date().toISOString();

const sender = {
  additional_attributes: {}, custom_attributes: {}, email: null, id: 5, identifier: null,
  name: 'Jp', phone_number: '+50660181661', thumbnail: '', blocked: false, type: 'contact',
};

const body = {
  account: { id: 2, name: 'Clínica Dental Dulce María' },
  additional_attributes: {}, content_attributes: {}, content_type: 'text',
  content: CONTENIDO,
  conversation: {
    additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
    contact_inbox: { id: 13, contact_id: 5, inbox_id: 7, source_id: '50660181661' },
    id: 10, inbox_id: 7,
    messages: [{
      id: 900, content: CONTENIDO, account_id: 2, inbox_id: 7, conversation_id: 10,
      message_type: 0, created_at: ahora, private: false, status: 'sent',
      content_type: 'text', content_attributes: {}, sender_type: 'Contact', sender_id: 5,
      conversation: { assignee_id: null, contact_inbox: { source_id: '50660181661' } },
      sender,
    }],
    labels: [],
    meta: { sender, assignee: null, assignee_type: null, team: null, hmac_verified: false },
    status: 'open', custom_attributes: {}, unread_count: 1,
    account: { id: 2, name: 'Clínica Dental Dulce María' },
  },
  created_at: iso, id: 900,
  inbox: { id: 7, name: 'Agente - Clínica Dental Dulce María' },
  message_type: 'incoming', private: false, sender: { ...sender, avatar: '' },
  event: 'message_created',
};

console.log('enviando:', JSON.stringify(CONTENIDO));
const r = await fetch('https://n8n.trignia.com/webhook/whatsapp-clinica-demo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('webhook →', r.status, (await r.text()).slice(0, 200));
```

```powershell
node probar.mjs "cuanto cuesta una limpieza?"
```

Responde `200 {"message":"Workflow was started"}` de inmediato: el webhook no espera al
agente. Hay que ir a buscar el resultado en las ejecuciones.

### Qué campos del payload usa realmente el workflow

No hace falta un payload perfecto de Chatwoot, pero **estos sí se leen** y si falta alguno
el workflow se desvía o revienta:

| Campo | Quién lo usa |
|---|---|
| `body.message_type` = `"incoming"` | el `If` de entrada; si no, se va a la rama de "conversación resuelta" |
| `body.event` = `"message_created"` | idem |
| `body.content` | el texto que recibe el agente |
| `body.account.id` | arma las URLs de Chatwoot |
| `body.conversation.messages[0].conversation_id` | idem (responder, nota privada, toggle) |
| `body.conversation.messages[0].sender.phone_number` | `sessionKey` de la memoria de chat |
| `body.sender.phone_number`, `body.sender.name`, `body.created_at` | el sub-workflow del CRM |
| `body.conversation.messages[0].conversation.contact_inbox.source_id` | el correo de escalamiento |

---

## 2. Leer qué contestó

Las ejecuciones se listan de más nueva a más vieja. **Ojo:** un solo mensaje genera varias
ejecuciones (la tuya, más el eco `outgoing` de la respuesta del bot, más los eventos de
cambio de estado). La que te interesa es **la que dura segundos**, no las de ~100 ms.

Con las herramientas MCP:

```
n8n_executions  action=list  workflowId=GmGt3g3krJCoDli0  limit=4
n8n_executions  action=get   id=<la larga>  mode=filtered  itemsLimit=1 \
                nodeNames=["Agente de clínica","¿Requiere Escalamiento?","Preparar Mensaje Final"]
```

Qué mirar en cada nodo:

- **`Agente de clínica`** → el JSON crudo del modelo. Si trae `{"error": "..."}` el agente
  falló y todo lo demás es el fallback, no una respuesta real.
- **`¿Requiere Escalamiento?`** → si salió por `main[0]` escaló; por `main[1]` respondió normal.
- **`Preparar Mensaje Final`** → **lo que de verdad recibe el paciente**. Cuando escala, acá
  aparece el mensaje genérico de `Configuración Clínica`, no el texto que redactó el agente.

Para confirmar que el agente llamó a `catalogo_servicios`, mirá el tiempo de ejecución del
nodo `Agente de clínica`: sin llamada a herramienta ronda 1–2 s, con llamada sube a 3 s o más.

---

## 3. Limpiar entre pruebas

La memoria de chat guarda las últimas 20 interacciones (`contextWindowLength: 20`). Si no la
limpiás, el modelo copia sus respuestas anteriores y una prueba "pasa" por imitación, no
porque la regla nueva funcione. **Esto ya me hizo dar un falso positivo**, así que limpiá
siempre entre pruebas de prompt.

El propio workflow borra el historial cuando le llega un evento de conversación resuelta.
Guardá esto como `reset.mjs`:

```js
// node reset.mjs   → borra el historial del número y reabre la conversación
const WH = 'https://n8n.trignia.com/webhook/whatsapp-clinica-demo';
const CW = 'https://whatsapp.trignia.com/api/v1/accounts/2/conversations/10';
const HCW = { api_access_token: process.env.CW_TOKEN, 'content-type': 'application/json' };

// 1. evento "resuelta" → dispara Reiniciar Memoria de Sesión
const resuelta = {
  event: 'conversation_status_changed',
  status: 'resolved',
  id: 10,
  account: { id: 2, name: 'Clínica Dental Dulce María' },
  meta: { sender: { phone_number: '+50660181661', name: 'Jp', id: 5 } },
};
let r = await fetch(WH, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(resuelta),
});
console.log('evento resuelta →', r.status, (await r.text()).slice(0, 120));

await new Promise((s) => setTimeout(s, 4000));

// 2. reabrir, si no el guardia bloquea el siguiente mensaje
r = await fetch(`${CW}/toggle_status`, {
  method: 'POST', headers: HCW, body: JSON.stringify({ status: 'open' }),
});
console.log('reabrir →', r.status, (await r.text()).slice(0, 160));
```

```powershell
$env:CW_TOKEN = "<token_chatwoot del nodo Configuración Clínica>"
node reset.mjs
node probar.mjs "cuanto cuesta la limpieza profunda?"
```

El evento de resuelta también le manda al paciente el `mensaje_cierre`. Es un WhatsApp extra
de más por cada limpieza.

### Solo reabrir, sin borrar la memoria

```js
await fetch('https://whatsapp.trignia.com/api/v1/accounts/2/conversations/10/toggle_status', {
  method: 'POST',
  headers: { api_access_token: process.env.CW_TOKEN, 'content-type': 'application/json' },
  body: JSON.stringify({ status: 'open' }),
});
```

---

## Receta completa

```powershell
$env:CW_TOKEN = "<token>"
node reset.mjs                                    # memoria limpia + conversación abierta
node probar.mjs "cuanto cuesta la limpieza profunda?"
# esperar ~10 s y listar ejecuciones; abrir la que dure segundos
```

Y al terminar la sesión de pruebas, correr `reset.mjs` una vez más para no dejar la
conversación trabada en `pending`.

---

## Escribir en un Google Sheet por la misma vía

Variante del mismo truco, por si hace falta: el MCP de Drive solo lee. Para escribir se crea
un workflow temporal (webhook → HTTP Request a `sheets.googleapis.com/v4/spreadsheets/{id}/values/{rango}`
con `authentication: predefinedCredentialType` y `nodeCredentialType: googleSheetsOAuth2Api`),
se activa por API, se le hace POST y se borra. Así se cargó el catálogo de servicios —
ver [agente-catalogo-servicios.md](agente-catalogo-servicios.md), sección 2b.
