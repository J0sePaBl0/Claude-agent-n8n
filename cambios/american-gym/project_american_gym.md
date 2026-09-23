---
name: project-american-gym
description: "Demo American Gym (2026-09-11): clon de los 4 workflows de Dulce María sobre el mismo número de WhatsApp; IDs, decisiones y qué falta."
metadata: 
  node_type: memory
  type: project
  originSessionId: c2480d47-1cf6-475d-896e-e40889586c7d
  modified: 2026-09-23T22:31:54.616Z
---

Desde **2026-09-11** se construye el demo de **American Gym** reusando el número +506 6419-1107
(Chatwoot cuenta 2, bandeja 7, WhatsApp Cloud API). Dulce María queda archivada e intacta
([[project-clinica-agenda]], [[project-clinica-fuentes-de-verdad]]); plan en
`C:\Users\PC\.claude\plans\ahora-lo-que-ocupo-melodic-parnas.md`.

**IDs del gimnasio** (los 4 están **ACTIVOS** desde antes del 2026-09-16 — verificado contra la
instancia, no asumir lo contrario; registro en `scripts/american-gym/workflows.json`):
agente `bNfwNLVIn3WPAquq`, motor `vxjbcHiSr2fNeuLu`, correos `KgRMl5NZ87melAi4`, CRM
`ThFJLkJVpAI7nef4`, credencial `Chatwoot API — trignia` `bGtgLhUB3PrBTJ3w` (httpHeaderAuth; el
token ya no va en el Set). Sheet `CRM - American Gym` `1F4L47pfKas1iCFtODMFmipwDib_9UnjvXFarYoT5pCY`.
Carpeta RAG `1Iu6Zx-g1pX2N4g0_NKpXHPqs-2bUbwYS`. `clinic_id=american_gym`, memoria
`n8n_chat_histories_american_gym`, webhook `whatsapp-american-gym`.

**Decisiones del usuario:** las personas son **clientes** (no socios); las **citas siguen
siendo citas**; **sin reglas por tipo de cita** (`REGLAS_POR_TIPO = false`, código intacto);
pestañas y columnas renombradas (Clientes, Entrenadores, Membresías, id_cliente,
id_entrenador…); **no tocar el perfil de WhatsApp** (se ve "Horarios ministros" + descripción
dental); la info del gimnasio la pasa el usuario.

**El nombre real del cliente** (2026-09-16): el nombre del perfil de WhatsApp no sirve (en el
número del demo es "Horarios ministros"). El agente lo pide junto con el correo antes de
agendar y lo manda en una entrada NUEVA del motor, `nombre_dictado`, separada de
`nombre_cliente` (el del perfil). `Validar reglas` escribe en Clientes con precedencia
**dictado > hoja > perfil**, y la salida del motor devuelve `nombre_registrado` /
`email_registrado`. Para saludar por el nombre en el PRIMER mensaje —antes de cualquier
tool— el agente lee `Clientes!A:Q` en dos nodos nuevos colgados de `¿Bot Puede Responder?`
(`Buscar cliente registrado` → `Cliente registrado`), que devuelven la `frase` ya redactada
para el system message. Prueba offline: `node scripts/american-gym/probar-nombre.mjs`; en vivo, POST a
`/webhook/agenda-test-american-gym` (el motor está activo). **Ojo: `confirmar`, `cancelar` y
`reagendar` ESCRIBEN en el Sheet** — solo `consultar_disponibilidad` es de lectura.

**Info real del gimnasio cargada** (2026-09-16): Config, 23 `Entrenadores` (9 de planta desde el
cuadro de turnos + 14 filas `CLS-*` dedicadas a cada clase) y 20 `Servicios`, desde
`scripts/american-gym/cargar-catalogo.mjs` (fuente de verdad; editar la hoja a mano se pisa).
**Precios reales cargados 2026-09-23** (tabla del gimnasio; nada inventado salvo Rutina personalizada ₡9.000, a pedido del usuario; lo no especificado quedó SIN precio y el agente escala). Proxy de Sheets: `node scripts/agenda/proxy.mjs crear|borrar`. Docs del RAG corregidos ya subidos a Drive y reindexados 2026-09-23 (Drive se toca con un workflow temporal + credencial `dv8Iv9ky8MjgX5Cv`; triggers de Drive siguen OFF, reindexar a mano). Pendientes en `cambios/american-gym/pendientes.md`; antes: pendientes los reales, junto con
reglamento/políticas: ver `cambios/american-gym/pendientes.md`. Docs del RAG escritos en
`cambios/american-gym/rag/` (sede-y-horarios, clases, equipo, marcas), **sin precios** y todavía
SIN subir a Drive. El bot atiende las 5 marcas del WhatsApp 7254-7861 pero solo cotiza/agenda
Gym, Pilates y Jungle Box.

**Clases grupales con cupo** (decisión del usuario, 2026-09-16): `Servicios.cupo` (columna L
nueva) dice cuántos caben; vacío o 1 = cita 1 a 1 de siempre. El motor CUENTA solapes en vez de
cortar con el primero (`calcular-slots-libres` y `confirmar-y-preparar`), y rebota la doble
inscripción con `motivo: "ya_inscrito"`. Una clase es una fila `CLS-*` de `Entrenadores` con la
ventana exacta de la clase, separada del entrenador de planta para que las inscripciones no le
tapen su agenda 1 a 1; una clase con dos horas el mismo día necesita DOS filas (el motor solo
admite una ventana continua por día).

**Bug de fábrica arreglado — teléfonos `#ERROR!`:** `Fila cliente` guardaba `+506 8888-9999` y
Google Sheets lo tomaba como fórmula. El cliente no se volvía a encontrar NUNCA por teléfono:
ficha nueva en cada reserva, citas invisibles para confirmar/cancelar y el agente sin poder
saludarlo por su nombre. Ahora se guarda `(+506) 8888-9999`, como ya hacía el CRM. Estaba igual
en Dulce María.

**Bug de fechas arreglado (2026-09-16):** `Interpretar la fecha` resolvía el nombre del día
ANTES que el número, con `break`, así que "el miércoles 23 de septiembre" caía en el miércoles
de esta semana y la reserva salía con una semana de diferencia. Ahora la fecha explícita gana,
pero solo cuando no puede ser la hora disfrazada (lleva mes, o el número es > 12); "el miércoles
6 de la tarde" sigue resolviendo por día de la semana a propósito.

**Trampa al editar estos archivos con scripts:** escribir regex JS dentro de `new RegExp('...')`
desde python/heredoc pierde la contrabarra doble y queda `''` (backspace) y `'\d'` (una "d"),
que fallan EN SILENCIO. Usar literales `/.../ ` en vez de `new RegExp('...')`, o el tool de Edit.

**Herramienta `mis_citas`** (2026-09-16): acción `consultar_citas` del motor, de SOLO LECTURA,
resuelta entera dentro de `localizar-cita.js` y devuelta por la rama `ok:false` de
`¿Cita localizada?` (es el único camino que no pasa por el cálculo de espacios, que exigiría
un `id_servicio`). Existe porque no había ninguna forma de contestar "¿qué citas tengo?" sin
efectos —las de gestión confirman o cancelan de verdad— y el modelo lo contestaba de memoria.
`motivo` nuevo: `listado`. El prompt ahora la exige en ese mismo turno.

**El agente ya no pide una confirmación de más**: si el cliente eligió día y hora concretos,
reserva en ese turno y confirma en la misma respuesta. Repregunta solo si de verdad falta algo.

**Voz humanizada del agente** (2026-09-16): el bot sonaba a máquina (menú de opciones, viñetas,
"en estado solicitada", tres fechas completas repetidas, nombre del cliente en cada mensaje).
Decisión: registro cálido neutro de Costa Rica ("con mucho gusto", "claro que sí"; nada de "pura
vida"/"diay"), usted siempre, sin nombre propio pero en primera persona del equipo. Se agregó al
prompt la sección `# CÓMO DECIR LO QUE DEVUELVE UNA HERRAMIENTA`: los mensajes del motor traen
DATOS intocables (fecha, hora, precio+unidad, cupo, cargo, estado) que el agente re-dice CON SUS
PALABRAS — se descartó limpiar los ~15 mensajes enlatados del motor, así que esta regla es la
única barrera contra perder un dato. Sección nueva `# ASÍ NO / ASÍ SÍ` con 8 ejemplos. Reglas de
forma: sin viñetas/menús, tope 4 líneas, comprimir fechas repetidas, 1 emoji máx, no repetir
muletilla ni nombre. `CAMBIOS_CFG` (`clonar.mjs`) ganó `mensaje_escalamiento_dentro_horario` y
`mensaje_escalamiento_fuera_horario` (antes NO estaban ahí, vivían solo en el Set heredado de
Dulce María — hay que agregarlas a `CAMBIOS_CFG` para que el bucle las sobrescriba). La de fuera
de horario lleva "llame al 9-1-1": tapa un hueco real donde `Preparar Mensaje Final` descarta la
respuesta del agente al escalar y antes se perdía el aviso de emergencia de noche.

**Decisión explícita: NO tocar `Preparar Mensaje Final`** (que hoy descarta la respuesta del
agente y manda solo la línea enlatada al escalar). Es la única garantía estructural de que nada
que el modelo escriba sobre salud llegue sin filtro al cliente, y `informacion_no_disponible` es
justo el caso donde ese texto es menos confiable. Verificado en vivo: la línea nueva salió
literal en `tema_salud_sensible` e `informacion_no_disponible`.

**Batería de pruebas conversacionales:** `scripts/american-gym/probar-agente.mjs` (grupos rag,
precios, agenda, clases, gestion, limites, **voz**, **voz2**). Manda WhatsApp REAL al 6018-1661,
escribe en el CRM y reabre la conversación de Chatwoot entre turnos — sin eso, un escalamiento
la deja en `pending` y el bot no vuelve a contestar nunca. `--limpiar` limpia la memoria del chat
(antes el header prometía hacerlo solo y no lo hacía); sin la flag, varias invocaciones separadas
pueden ser a propósito la misma conversación (`agenda` en una llamada, `reservar` en otra). Cada
turno reporta el `mensaje` crudo de la herramienta al lado de lo que dijo el agente, para
detectar a mano si "humanizar" se comió un dato.

**El proxy `TEMP — Sheets IO` ya no existe en la instancia**: `scripts/agenda/sheets.mjs` no
funciona hasta recrearlo con `node scripts/agenda/proxy.mjs crear` (y `borrar` al terminar — es
un webhook sin autenticación que proxea a Google con la credencial de la cuenta).

**Cola de escrituras del motor (2026-09-23):** una ráfaga de 16 reservas simultáneas metió 15 en una clase de 12 (todas con el mismo `id_cliente` e ids de cita repetidos): Sheets no es atómico y todas leían el mismo estado. Arreglo: turno en Postgres (tabla `agenda_turno`, `scripts/american-gym/crear-tabla-turno.mjs`, credencial `ctiw7NSHBqX5YzqF`) que `agendar/confirmar/cancelar/reagendar` toman ANTES de `Leer todo el CRM` y sueltan tras `Respuesta`; las consultas no hacen cola. Está en `serializarEscrituras()` de `clonar.mjs`, así que sobrevive al clonado. Los reintentos de Sheets subieron a 5x5s (una ráfaga agota los 60 lecturas/min). Verificado con `scripts/american-gym/probar-cupos.mjs` (12 aceptadas exactas de 16, 0 errores, 67 s; tarda por la fila). Ese script escribe en el Sheet real y cancela lo suyo; deja filas de prueba que se borran con `deleteDimension` (bloque final contiguo). Solo las clases grupales tienen cupo; 1 a 1 se limita por cuántos entrenadores hay libres. **Pilates Reformer (`SRV-010`) tiene `cupo` vacío/1 en el Sheet vivo** (el script dice 6) y no se corrigió: el clasificador bloqueó la escritura. `localizar-cita.js` vivo tenía `ambiguo_cual_cita` sin estar en el repo; ya se trajo.

**Retest del 16-sept revalidado (2026-09-23, con el WhatsApp del usuario 6018-1661):** 5.3, 7.5, 6.4, 8.2 pasan; 7.3 estaba roto de raíz — `reagendar_cita` solo recibía el DESTINO en `fecha_texto` y no había cómo decir CUÁL cita mover (acertaba solo si el día destino = día de la cita). Arreglo: entrada nueva `cita_a_mover` (motor `Cuando el agente llama`/`Normalizar entrada` en `clonar.mjs`, filtro `filtrarPorLoDicho` en `localizar-cita.js`; en reagendar ya no se filtra por el día del destino). También `cupo = 0` explícito = clase cerrada (antes `|| 1` lo leía como 1 a 1: así "forzó a 0" el tester y reservó igual). El AGENTE se parchó EN VIVO (PUT con `permitirTriggersConCredencial`, respaldo `agente-antes.json` en el scratchpad), NO con `clonar.mjs agente` (perdería el filtro de voz). El bot decide si responde por `assignee_id == null` de Chatwoot, no por status: tras escalar (pending, sin asignar) SIGUE contestando; con un humano asignado se calla — es lo esperado (el bug viejo era que se quedaba mudo). Grupos `r53 r75 r73a-e r64 r64b r82` en `probar-agente.mjs`; `retest-cupo.mjs` llena Pilates Reformer con teléfonos ficticios. Observación abierta: "el jueves a las 6" sin fecha lo interpreta como el próximo jueves, no el de la cita.

**Why:** clonar y no editar en sitio deja Dulce María restaurable (rollback = apuntar el webhook
#2 de Chatwoot de vuelta a `whatsapp-clinica-demo`) y evita el PUT sobre workflows activos.

**How to apply:**
- La fuente es el repo, no n8n: código en `scripts/american-gym/code/`, prompt en
  `cambios/american-gym/system-message-agente-gym.txt`; se publica con
  `node scripts/american-gym/clonar.mjs [correos|motor|crm|agente]` (idempotente, `--seco=<dir>`
  para armar sin tocar n8n). Editar en la UI se pisa en el próximo clonado.
- Los scripts eligen demo con `TENANT=american-gym` (`scripts/agenda/tenant.mjs`); sin TENANT
  apuntan a Dulce María.
- Reemplazos de texto sobre workflows: hacerlos sobre valores parseados (`mapearTextos`), no
  sobre el JSON serializado — `\b` no ve una palabra pegada a un `\n` literal.
- Pendiente con la info del gym: catálogo/entrenadores/Config/enums en el Sheet, docs del RAG
  (Markdown, sin precios), calendarios, `CARGO`/`HORAS_AVISO` (motor `preparar-gestion` y
  `armar-correo`), colores `MARCA`, trato/tono/horario humano en `Configuración del negocio`.
  Después: regresión, pruebas por conversación, limpieza de conversaciones y corte en Chatwoot.
- Bugs de Dulce María arreglados solo en el gym: CRM con `temperature` (gpt-5.6-luna lo rechaza,
  todas las capturas fallaban), `Reprogramada` no ocupaba espacio, "a las 6" siempre 18:00,
  domingo fijo cerrado.

**Espejo en Google Calendar implementado y verificado (2026-09-16):** los nodos de Calendar del
motor ya venían habilitados del clon de Dulce María, pero `Entrenadores!I` (id_calendar) estaba
vacío en las 23 filas → el nodo fallaba en silencio (`onError: continueRegularOutput`) y ninguna
cita llegaba a Calendar aunque el Sheet quedara bien. Se creó **un calendario por PERSONA real**
(18, no 23): deduplicado por nombre (Julia Acuña cubre `ENT-003` y `CLS-BOX-SAB`; Natalie Araya
Briones cubre `CLS-PIL-PM` y `CLS-GLUTEOS`), "Coach de turno" genérico para las 3 filas de
Cycling/GAP sin instructor fijo, y `ENT-009` (Nicole Arguedas, Head Coach) queda SIN calendario
a propósito porque está `activo=FALSE` y el motor nunca la agenda. Misma credencial
`PTFrwFEcqS8cEEKT` ("Google Calendar account") que ya usan los 4 calendarios de Dulce María —
misma cuenta, coexisten por nombre/color, decisión del usuario tras confirmar que Google Calendar
sí permite ver todos los calendarios superpuestos en una sola vista. Compartidos con
artaviajosepablo687@gmail.com (writer).

Script `scripts/american-gym/crear-calendarios.mjs` (`TENANT=american-gym node
scripts/american-gym/crear-calendarios.mjs --apply --compartir <correo>`, dry-run sin `--apply`):
autocontenido (crea su propio proxy temporal "TEMP — Calendar IO Gym", no depende del proxy
general de sheets.mjs que ya no existe), valida el orden de `Entrenadores!A2:A24` contra el Sheet
en vivo antes de escribir, y es **idempotente/reanudable** — busca calendarios existentes por
nombre exacto (`calendarList.list`, `accessRole=owner`) antes de crear, así que una corrida
cortada a mitad de camino no duplica. Hizo falta: la primera corrida murió a mitad (blip de DNS
de `n8n.trignia.com`, típico de este entorno) tras crear 8/18 calendarios y sin borrar el proxy
temporal (quedó activo, webhook sin auth — se borró a mano); la reanudación con `--apply` de
nuevo reusó los 8 existentes y completó los 10 restantes sin duplicar. `llamar()` ahora reintenta
ante fallos de red (igual que `sheets.mjs`), y el borrado del proxy en el `finally` no revienta el
proceso si también falla — imprime el ID para borrarlo a mano.

Verificado end-to-end con una reserva de prueba real (teléfono +506 6000-0000): `agendar` creó
el evento en el calendario de Mario Cruz Rojas (confirmado leyendo la ejecución del motor, nodo
`Crear evento en Calendar`) y `cancelar` lo borró (`Borrar evento de Calendar`). Ambos caminos
—agendar y gestión (confirmar/cancelar/reagendar)— funcionan de punta a punta. Esa cita/cliente
de prueba (`CLI-0005`/`CITA-0008` de ese momento) se borró después con `deleteDimension` (no
`batchClear`, por el gotcha de [[n8n_sheets_append_filas_vacias]]).

**Llenado parcial para la demo (2026-09-16):** ya existía semilla previa (`CLI-0001..CLI-0004`,
`CITA-0001..0007`, varias marcadas "(ficticio)" en las notas; `CLI-0004` es el número de prueba
del usuario, +506 6018-1661). Se sumaron **7 citas/clientes nuevos** vía
`scripts/american-gym/sembrar-demo.mjs` (`TENANT=american-gym node
scripts/american-gym/sembrar-demo.mjs --apply`, dry-run sin `--apply`): pasa por el webhook REAL
del motor (no escribe el Sheet a mano), así que cada una generó también su evento real en el
Calendar del entrenador. Teléfonos ficticios `+506 6001-10XX`, fáciles de identificar. Quedaron
`CITA-0008..CITA-0014` (`CLI-0005..CLI-0011`): 4 Confirmada (Mario/personal, Bruna/Pilates,
Andrei/Jungle Box, Ana/Yoga) + 3 Solicitada (Norman/valoración, Patricia/Pilates Animal, Juan
Carlos/Military) — variedad de entrenadores, clases y estados.

**Causa de los 5 rechazos, confirmada (2026-09-16): no era un bug, la malla funcionaba bien.**
`calcular-slots-libres.js` ancla la malla de cada entrenador al INICIO de su ventana y avanza en
pasos del tamaño exacto de `duracion_min` del servicio (`for (ini = abre; ...; ini += paso)`,
`paso = duracion`) — es a propósito, el comentario del código lo dice: "una sesión de 45 min da
06:00, 06:45, 07:30... y una evaluación de 30 da 06:00, 06:30...". Pedí horas ":30" que no caían
en esa malla (p. ej. Jason/Full Body ventana 17:00-19:00 con servicio de 60 min solo tiene
17:00 y 18:00; pedí 17:30). Reintentados los 5 con la hora exacta de malla → **los 12/12
quedaron agendados** (`CITA-0008..CITA-0019`, `CLI-0005..CLI-0016`), cada uno con su evento real
en Calendar. Nota aparte: el `mensaje` de error de `resolver-slot-pedido.js` siempre describe
`todos[0]` (el espacio más próximo en TODO el horizonte de 21 días), no algo del día pedido —
por eso alguna alternativa sonaba a "hoy" aunque el cliente pidió una fecha futura; el array
`alternativas` si trae opciones relevantes, es solo el texto corto el que puede despistar. No
se tocó, no bloqueaba nada.

**Gotcha nuevo: tildes en `curl -d` vía el tool de Bash en este Windows corrompen el UTF-8.**
"Rodríguez" pasado literal en el JSON de un `curl -d '...'` llegó a Sheets como "Rodr�guez"
(un solo carácter, no dos); mismo texto con nombres sin tilde salió bien, y los mismos nombres
con tilde vía un script `.mjs` (fetch de Node, como `sembrar-demo.mjs`) también salieron bien.
Se corrigió a mano (`Clientes!B16`). **Para textos con tildes/ñ hacia un webhook, usar un script
Node (fetch) en vez de `curl` inline por el tool de Bash.**

**Voz al escalar (2026-09-23):** el mensaje que ve el cliente = `respuesta` del agente + aviso fijo (`mensaje_escalamiento_dentro_horario`) pegados en el nodo `Determinar Mensaje por Horario`. El modelo insistía en abrir con "La información disponible no confirma…" aunque el prompt lo prohíba (le pesa el historial), así que hay un **filtro determinista** en ese nodo VIVO (`scripts/american-gym/code/agente/filtro-voz-escalamiento.js`). Ese nodo y el aviso nuevo NO están en `clonar.mjs`/`code/agente/determinar-mensaje-por-horario.js` (versión vieja): si se vuelve a clonar, se pierden. Sección "Cuando escalas" + ejemplos 9 y 10 en el system message. Ojo al probar: si el usuario chatea al mismo tiempo con el número de prueba, las respuestas de `conversar.mjs` se cruzan con las suyas.

**Reglamento (2026-09-23):** el docx "Políticas y Reglamento Interno" del gimnasio (en `cambios/american-gym/`) se convirtió a `rag/reglamento.md`, subido a Drive (id `1cxaf-OpE3Y-hOhcq9H3RvnXa1amGX8wM`) y reindexado; probado (menores, membresía personal, fumar, comida, objetos perdidos, salud). NO trae congelamiento/devoluciones/pagos concretos: solo "se gestiona en recepción". Regla en el system message: eso se contesta como "en recepción" con escalar=false; solo escalan las formas de pago. Subir a Drive: workflow temporal con la credencial `dv8Iv9ky8MjgX5Cv` (upload con `folderId`) + reindexar con webhook temporal en el agente, luego borrar ambos.
