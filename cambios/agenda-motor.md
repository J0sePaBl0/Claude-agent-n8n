# Agenda: motor de disponibilidad y citas

**Workflows:** `Agenda — disponibilidad y citas` (`LsbRqfF2c32hVahw`, nuevo, ACTIVO) y
`Agente conversión y agenda` (`GmGt3g3krJCoDli0`, 56 → 58 nodos).
**Objetivo:** que el agente deje de poder inventar horarios. Era el pendiente #2 de
[agente-catalogo-servicios.md](agente-catalogo-servicios.md): el prompt describía una
herramienta `agenda` que no existía.
**Estado: APLICADO Y PUBLICADO el 2026-08-05.**

> **Cómo se aplicó:** el sub-workflow por la API pública; el agente por REST
> (`PUT /api/v1/workflows/{id}`), no por el MCP. Backup previo en el scratchpad
> (`backup-GmGt3g3krJCoDli0-2026-08-05.json`). `pinData` y `staticData` se conservaron.
>
> ⚠️ **La API pública rechaza `settings` con claves que no conoce.** Este workflow tiene
> `availableInMCP` y `binaryMode`, que hay que **filtrar antes del PUT** o devuelve
> `400 request/body/settings must NOT have additional properties`. n8n las conserva sola.

---

## 0. Lo que pasó con la credencial (leer antes que nada)

**El PUT dejó el workflow desactivado y el bot estuvo caído unos minutos.** El PUT fuerza
una re-activación, y al re-activar n8n revalida las credenciales de los nodos **trigger**.
La credencial `Trignia automations email` (Google Drive OAuth) está **vencida**, así que la
activación falló y el workflow quedó en `active: false`.

Se restauró deshabilitando los dos triggers de Drive del agente, que son los únicos que
bloqueaban:

| Nodo | Estado |
|---|---|
| `Archivo creado` (`googleDriveTrigger`) | **deshabilitado** el 2026-08-05 |
| `Archivo actualizado` (`googleDriveTrigger`) | **deshabilitado** el 2026-08-05 |

**Qué se perdió mientras tanto:** la sincronización *automática* del RAG cuando se sube o
se edita un archivo en la carpeta de Drive. El reindexado manual
(`Reindexar todo (manual)`) y el workflow `RAG Sync` (`p92vLPvE7MJZ0OYj`) siguen ahí.

**Cómo revertirlo:** reconectar la credencial en la UI de n8n (es OAuth, requiere navegador)
y volver a habilitar los dos nodos.

> ⚠️ **`Trignia whatsapp` (`BuwFfNVWsYVLyasgZfJ19`) tiene la misma bomba armada.** Está
> activo con esos dos triggers de Drive **habilitados** y la misma credencial vencida. Hoy
> funciona porque se activó cuando la credencial servía; **la próxima vez que alguien lo
> guarde se va a desactivar igual**. Conviene reconectar la credencial antes de tocarlo.

---

## 1. Por qué un sub-workflow y no nodos colgados del agente

Mismo criterio que con los precios: **una sola fuente por dato y lectura determinista.** La
diferencia con `catalogo_servicios` es que la agenda no es una lectura, es un cálculo — hay
que cruzar cinco tablas, aplicar las reglas de `DM_01`/`DM_03` y resolver fechas en español.

**Lo que se le saca al modelo, que es lo que hace que esto funcione:**

| Dato | Quién lo decide |
|---|---|
| Qué día es hoy | Code node con Luxon y zona `America/Costa_Rica` |
| Qué fecha es "el martes" | Code node |
| Qué horarios existen | el motor, leyendo `Profesionales` + `Citas` |
| Qué profesional atiende qué | el Sheet (`profesionales_habilitados`) |
| El teléfono del paciente | expresión sobre el payload del webhook |
| El `id_oportunidad` | el motor, buscando por teléfono |
| A qué espacio se refirió | Code node, contra la disponibilidad recalculada |
| **Qué servicio quiere** | el modelo (`id_servicio`) |
| **Qué palabras dijo sobre la fecha** | el modelo, copiándolas textual |

El modelo pone dos cosas y las dos las verifica el motor.

---

## 2. Paso 0 — saneo de datos (bloqueante)

No se puede calcular disponibilidad con `Profesionales` en ficción. Backups de los 6 tabs en
`cambios/*-backup-2026-08-05.tsv`. 208 celdas escritas.

> ⚠️ **El tab de la sede se llama `Config`, no `Sedes`.** Tiene las columnas de la sede en
> `A:I` y **20 columnas de listas de enums del CRM desde la `L`**. Escribir un rango más
> ancho que `A2:I2` las borra.

| Qué | Cambio |
|---|---|
| `Profesionales!A1:I7` | Los 4 reales de `DM_01`, reusando `PROF-01`…`PROF-04` para no romper referencias. `PROF-05`/`PROF-06` quedan con `activo = FALSE` |
| `Servicios!K2:K39` | 15 de 38 filas remapeadas: periodoncia y odontopediatría (ex PROF-05/06) → **PROF-01**; los restaurativos que no son endodoncia salen de PROF-03 |
| `Servicios!E2:E39` | 3 duraciones según `DM_03`: SRV-004 30→**45**, SRV-005 60→**90**, SRV-011 90→**120** |
| `Citas!C` | CITA-0011, CITA-0013 y CITA-0014 → PROF-01. Son las únicas de PROF-05/06 que no están `Completada`; las completadas se dejan |
| `Tratamientos!D` | TRAT-0005 y TRAT-0006 → PROF-01 |
| `Config!A2:I2` | Nombre, dirección de San Pablo de Heredia, sábado hasta las **13:00**, teléfonos de `DM_01`. **Las coordenadas son aproximadas al centro del distrito**, no una ubicación exacta |
| `Feriados` (tab nuevo) | 11 feriados de Costa Rica 2026 |
| `Citas!R1` | Columna nueva `id_evento_calendar` |
| `Profesionales!I1` | Columna nueva `id_calendar` |

**Horario partido:** PROF-04 no cabe en `HH:MM-HH:MM`, va como
`Mié:13:00-18:00;Sáb:08:00-13:00`. El motor parsea los dos formatos.

**Simplificación consciente:** `DM_01` dice que la Dra. Vargas atiende "sábados alternos".
No es expresable en el modelo de datos; figura todos los sábados.

**Cómo se escribió:** workflow temporal (webhook → HTTP Request con la credencial
`googleSheetsOAuth2Api`), disparado por POST y borrado al terminar. Crear el tab `Feriados`
necesitó `POST /v4/spreadsheets/{id}:batchUpdate` con `addSheet`: **`values.update` no puede
crear un tab.**

---

## 3. El sub-workflow

31 nodos. `settings.timezone = "America/Costa_Rica"` — sin eso `$now` sale en UTC y todos los
slots se corren 6 horas.

```
Cuando el agente llama (Execute Sub-workflow Trigger) ─┐
Webhook de prueba  /agenda-test                       ─┴→ Normalizar entrada
  → Leer todo el CRM (1 batchGet, 8 rangos) → Preparar datos
  → Interpretar la fecha → Calcular slots libres → ¿Motor OK?
  → ¿Es agendar?
      ├── no  → Ordenar por cercanía → Respuesta
      └── sí  → Validar reglas → ¿Puede agendar?
                → Resolver slot pedido → ¿Slot resuelto?
                → Releer citas frescas → Confirmar y preparar → ¿Sigue libre?
                → Escribir cita → Fila paciente → Guardar paciente
                → Fila actividad → Escribir actividad
                → [Crear evento en Calendar — deshabilitado]
                → ¿Hay oportunidad? → Actualizar oportunidad
                → Respuesta agendada → Respuesta
```

### 3a. Una sola lectura, no ocho

**Google Sheets permite 60 lecturas por minuto por usuario** y cada nodo de Sheets gasta ~2.
La primera versión tenía un nodo por tab: con 5 lecturas por consulta, **dos pacientes
conversando a la vez tumbaban la herramienta con un `429`** (pasó en las pruebas, no en
teoría). Se reemplazó por un `values:batchGet` con los 8 rangos = **1 llamada**.

El costo es que `batchGet` devuelve filas crudas, así que `Preparar datos` las convierte a
objetos usando la fila de encabezados.

### 3b. Resolver la fecha

Ancla en `DateTime.now().setZone('America/Costa_Rica')` y entiende hoy / mañana / pasado
mañana, los días de la semana, "la próxima semana", "esta semana", "entre semana", "el fin
de semana", "el 5 de agosto", "05/08", "después del 15", "antes del 20", franjas
(mañana/tarde/temprano/al final del día) y horas ("a las 3", "10 y media", "3pm").

**El truco que más importa:** "mañana" es día y franja a la vez. La franja solo cuenta si
lleva artículo delante ("en la mañana"), y se saca del texto **antes** de buscar el día.

Sin `am`/`pm`, una hora entre 1 y 7 se interpreta como tarde: la clínica abre 8–18, así que
"a las 3" son las 15:00.

**Nunca falla:** si no entiende el texto, asume "lo más próximo disponible" y lo dice en
`interpretacion`.

### 3c. La malla de espacios

Los inicios se generan **cada `duracion_min`, anclados al arranque de la ventana del
profesional**, no cada 15 minutos. Una limpieza de 45 da 08:00, 08:45, 09:30…; una valoración
de 30 da 08:00, 08:30, 09:00… **La agenda se ve distinta según el servicio**, que es como
funciona una clínica. Una malla de 15 min ofrecería 08:15 y 08:30, horarios que ninguna
recepcionista ofrece.

Si el día que pidió el paciente queda vacío, hay una **segunda pasada con malla de 15 min**
sobre ese día: la malla anclada puede no ver un hueco que dejó una cancelación, y el contrato
es no decir "no hay" cuando sí hay.

Se descartó un tab `Disponibilidad` con espacios fijos: `DM_03` asigna *duraciones por tipo
de cita*, no espacios por tipo, y las 25 filas de `Citas` que ya existen (08:15, 09:45,
12:30, 16:45) no caen en ninguna malla fija.

### 3d. Las reglas de día NO están codificadas

Endodoncia martes y jueves, ortodoncia L/X/V por la mañana, implantes miércoles tarde o
sábados: todo eso **sale solo** del cruce `Servicios.profesionales_habilitados` ×
`Profesionales.dias_atencion`. **Para cambiarlas se edita el Sheet, no el workflow.**

Lo que sí es código explícito:

- Domingos y feriados cerrado.
- El último espacio termina **una hora antes del cierre de la sede** (`DM_01`). Ojo: contra
  el cierre de la *sede*, no contra el fin de la ventana del profesional — aplicarlo al
  profesional le borraría las 11:00 y 11:30 a la Dra. Jiménez (08:00–12:00). La cita sí
  tiene que caber entera en la ventana del profesional: son dos condiciones distintas.
- Nada de más de 90 min después de las 16:00 entre semana ni de las 11:00 los sábados.
- **2 espacios de urgencia** (10:00 y 15:00, 30 min), **solo en PROF-01**. Bloquearlos en los
  cuatro borraría casi toda la ventana de ortodoncia y de cirugía; las urgencias son
  odontología general.
- No se ofrece un espacio que arranque en menos de 2 horas.

> Efecto no obvio de las urgencias: para una limpieza de 45 min **las 09:30 no caben**,
> porque 09:30–10:15 pisa el bloqueo de las 10:00. La malla del jueves queda
> `08:00 08:45 11:00 11:45 12:30 13:15 14:00 15:30 16:15`.

### 3e. Orden de las validaciones (esto era un bug)

`Validar reglas` corre **antes** de `Resolver slot pedido`, a propósito.

La regla de valoración previa depende del paciente y del servicio, no de la hora. Con el
orden inverso, pedir una limpieza a las 10:00 —hora que no existe en la malla de 45 min—
devolvía *"ese espacio no está disponible"* y el paciente nuevo se iba con alternativas de
limpieza que **no puede reservar**. Se detectó probando.

La otra regla (`no dos citas de tratamiento el mismo día`) sí depende del espacio elegido y
se valida en `Confirmar y preparar`, contra la relectura fresca de `Citas`.

### 3f. Contrato de salida

**Nunca vacío y nunca un "no hay" pelado** — un resultado vacío es exactamente lo que hace
alucinar al modelo. Siempre salen `mensaje` redactado y `alternativas`.

```json
{ "ok": true, "interpretacion": "el martes 11 de agosto por la tarde",
  "disponible": false, "motivo": "dia_no_habilitado", "id_servicio_sugerido": null,
  "alternativas": [ { "texto": "martes 11 de agosto, 8:00 a. m., con Dr. Andrés Zeledón Mora",
                      "fecha": "2026-08-11", "hora_inicio": "08:00", "hora_fin": "10:00",
                      "id_profesional": "PROF-03" } ],
  "mensaje": "…" }
```

`motivo` es un valor fijo: `servicio_no_disponible`, `requiere_valoracion_previa`,
`dia_no_habilitado`, `feriado`, `domingo`, `dia_lleno`, `ambiguo`, `no_coincide`,
`dos_citas_mismo_dia`, `fuera_de_horario`.

> **`feriado` y `domingo` son motivos aparte de `dia_no_habilitado` por una razón concreta:**
> al pedir un implante el sábado 15 de agosto, el mensaje decía *"no se agenda ese día: el
> Dr. Arias atiende Mié, Sáb"* — y el 15 **es** sábado. El motivo real era el feriado. Un
> mensaje que miente sobre el porqué es peor que no dar motivo.

**Deduplicación por fecha+hora en `Respuesta`**, un solo lugar en vez de tres: sin eso, una
valoración —que la hacen los cuatro profesionales— se ofrecía como "8:00 con Dulce María" y
"8:00 con Andrés" como si fueran dos espacios distintos. Al paciente le importa la hora.

### 3g. La cita se escribe con `values:append` y `RAW`

El nodo normal de Sheets solo usa `USER_ENTERED`, y con eso Google convierte `"08:30"` en un
valor de hora y lo devuelve como `"8:30"` — inconsistente con las 25 filas que ya tiene la
hoja. `Citas` se escribe con un HTTP Request a `values:append?valueInputOption=RAW`. Los
otros tres tabs (`Pacientes`, `Actividades`, `Oportunidades`) sí usan el nodo normal.

**`¿Hay oportunidad?`** guarda el `appendOrUpdate` de `Oportunidades`: con un
`id_oportunidad` vacío agregaría una fila basura.

**La cadena de escritura es lineal a propósito.** Con `responseMode: lastNode` el webhook
devuelve lo que salga del último nodo que ejecute; con la oportunidad como rama lateral,
devolvía la fila de `Oportunidades` en vez de la respuesta. Un nodo deshabilitado deja pasar
los datos, así que Calendar no rompe la cadena.

---

## 4. Las dos herramientas del agente

Dos nodos `@n8n/n8n-nodes-langchain.toolWorkflow` **typeVersion 2.2** al mismo sub-workflow.
Dos herramientas chicas fallan menos que una con un parámetro `accion` que el modelo puede
errar.

> En v2.2 **no existe la propiedad `name`** (solo hasta 2.1): el nombre que ve el modelo es
> el **nombre del nodo**. Por eso se llaman `consultar_disponibilidad` y `agendar_cita`.
> Los campos van en `workflowInputs` (resourceMapper, `mappingMode: defineBelow`), y el
> esquema lo define el trigger del sub-workflow.

| Campo | consultar_disponibilidad | agendar_cita |
|---|---|---|
| `accion` | fijo | fijo |
| `id_servicio` | `$fromAI()` | `$fromAI()` |
| `fecha_texto` | `$fromAI()` | `$fromAI()` |
| `telefono` | `$('Entrada de mensaje').first().json.body.sender.phone_number` | idem |
| `nombre_paciente` | `$('Entrada de mensaje').first().json.body.sender.name` | idem |

El teléfono y el nombre **no los pone el modelo**: salen del payload del webhook por
expresión, lo mismo que ya usa `CRM - Enviar a captura de leads`. Elimina de raíz que el
agente invente o transcriba mal un número.

Acá **sí** se usa `$fromAI()`, a diferencia de `catalogo_servicios`, porque el contrato de
salida (motivos tipados y alternativas siempre presentes) hace que un parámetro mal puesto
no termine en un callejón sin salida.

### `fecha_hoy` en el prompt

Campo nuevo `cfg-0019` en `Configuración Clínica`:

```
{{ $now.setZone('America/Costa_Rica').setLocale('es').toFormat("cccc d 'de' LLLL 'de' yyyy, HH:mm") }}
```

**No es para que el modelo calcule fechas** —de eso se encarga el Code node— sino para que
hable con coherencia: que diga "el martes 4" y no "el martes 11", y que entienda "mañana"
cuando le resumen la conversación.

### Cambios al prompt (5 reemplazos quirúrgicos)

| # | Sección | Cambio |
|---|---|---|
| A | `# HERRAMIENTAS DISPONIBLES` | La línea de `agenda` (inexistente) por las dos reales |
| B | `# CÓMO USAR LA AGENDA` (nueva) | Pasar las palabras textuales; llamar a la herramienta antes de proponer nada; ofrecer 2–3 y no 6; nunca decir "ocupado" sin alternativas; repetir `interpretacion`; confirmar antes de agendar; avisar que queda *solicitada*; qué hacer con `ambiguo` y con `requiere_valoracion_previa` |
| C | `# FLUJO DE CONVERSACIÓN` paso 5 | Al flujo real de dos llamadas |
| D | `# ERRORES QUE NO DEBES COMETER` | Tres entradas nuevas al principio |
| E | Dentro de `# CÓMO USAR LA AGENDA` | **Si el paciente no dijo cuándo, NO preguntarle**: llamar igual con `fecha_texto` vacío y ofrecer lo más próximo |

El reemplazo **E salió de una prueba fallida**: ante *"quiero agendar una valoración"* el
agente contestaba *"¿cuándo le gustaría?"* sin llamar a la herramienta. La herramienta maneja
perfectamente un `fecha_texto` vacío devolviendo lo más próximo, así que preguntar solo
alarga la conversación.

Después se agregaron tres reemplazos más (F, G, H) por el bug del 2026-08-07 — ver §7.

El prompt vivo está en
[system-message-agente-clinica.txt](system-message-agente-clinica.txt) (15.641 caracteres).

---

## 5. Verificado el 2026-08-05

**El motor solo**, por `POST /webhook/agenda-test` (sin WhatsApp, sin tocar al agente):

| Prueba | Resultado |
|---|---|
| 10 frases de fecha (`mañana`, `el martes`, `la próxima semana en la tarde`, `después del 15`, `el 5 de agosto a las 3`, `el sábado`, `hoy a las 10 y media`, `el viernes en la mañana`, `pasado mañana temprano`, una sin fecha) | las 10 con `interpretacion` legible ✅ |
| Limpieza (45 min) el jueves | `08:00 08:45 11:00 11:45 12:30 13:15` — sin 09:30 ni 10:15 por el bloqueo de urgencia ✅ |
| Valoración (30 min) el mismo día | `08:00 08:30 09:00 09:30 10:00 10:30` — malla distinta según el servicio ✅ |
| Endodoncia el lunes | `dia_no_habilitado` + martes/jueves con el Dr. Zeledón ✅ |
| Ortodoncia el martes | `dia_no_habilitado` + L/X/V por la mañana con la Dra. Jiménez ✅ |
| Implante el sábado (120 min) | `08:00 10:00`, ningún inicio después de las 11:00 ✅ |
| Implante el 15 de agosto | `feriado` ✅ |
| Paciente nuevo pide limpieza | `requiere_valoracion_previa` + `id_servicio_sugerido: SRV-001` ✅ |
| `el jueves` a secas al agendar | `ambiguo` con 4 horas distintas ✅ |
| Agendar y repetir el mismo día | `dos_citas_mismo_dia` ✅ |

**End-to-end** por el webhook de producción, con el número de prueba:

| Mensaje | Resultado |
|---|---|
| `quiero agendar una valoracion` | llamó a `consultar_disponibilidad` y ofreció *"jueves 6 a las 8:00, 8:30 o 9:00 con la Dra. Dulce María… queda SOLICITADA hasta que la clínica la confirme 24 horas antes"* ✅ |
| `dale, el de las 8:30` | llamó a `agendar_cita`. Fila `CITA-0026`, `2026-08-06`, `08:30`–`09:00`, `Solicitada`, `Bot WhatsApp`, más `PAC-0021`, `ACT-00098` y `OPP-0013` a etapa *Cita agendada* ✅ |
| `necesito una endodoncia, puede ser el lunes?` | *"El Dr. Andrés Zeledón Mora atiende endodoncias los martes y jueves. Puedo ofrecerle el martes 11 de agosto a las 8:00 a. m."* ✅ |

Las filas de prueba se borraron después (`Citas` 25, `Pacientes` 20, `Actividades` sin
cambios, `OPP-0013` devuelta a etapa *Nuevo*).

**Cómo leer una ejecución:** un mensaje genera varias; la que interesa es la que dura
segundos, no las de ~100 ms. En el detalle, confirmar que aparece la llamada a
`consultar_disponibilidad`. Si propone un horario **sin** esa llamada, hay que endurecer el
prompt — mismo criterio con el que se validó `catalogo_servicios`.

Si el bot deja de responder, mirar el `status` de la conversación antes que el agente: el
guardia `¿Bot Puede Responder?` solo deja pasar `open`.

---

## 6. Espejo en Google Calendar — CONECTADO el 2026-08-07

Credencial `Google Calendar account` (`PTFrwFEcqS8cEEKT`, `googleCalendarOAuth2Api`), creada
a mano en la UI reusando el mismo cliente OAuth del proyecto `977564873312`. **Hay que
habilitar la Google Calendar API en la biblioteca del proyecto**: sin eso la credencial se
crea y conecta sin quejarse, y falla recién al crear el primer evento con un 403.

Cuatro calendarios creados por API en `trigniaautomations@gmail.com`, con
`timeZone: America/Costa_Rica` y un color distinto cada uno para que la vista semanal los
superponga:

| | Calendario | color |
|---|---|---|
| PROF-01 | Dra. Dulce María Vargas | 9 |
| PROF-02 | Dra. Carolina Jiménez | 5 |
| PROF-03 | Dr. Andrés Zeledón | 11 |
| PROF-04 | Dr. Felipe Arias | 10 |

Sus ids quedaron en `Profesionales!I2:I5`. No están compartidos con nadie más.

### Dos nodos, y se habilitan juntos

`Crear evento en Calendar` → `Guardar id del evento`. **Un nodo deshabilitado deja pasar los
datos**, así que habilitar solo el segundo lo haría guardar el id de un evento que nadie
creó. El primero va en `onError: continueRegularOutput`: si Calendar falla, la cita ya quedó
en el Sheet y el espejo no debe tumbar una reserva.

**Tres cosas que estaban mal en el nodo que se dejó preparado** y se arreglaron antes de
conectarlo:

1. El calendario salía de `{{ $json.id_calendar }}`, pero en ese punto de la cadena `$json`
   es la respuesta del append de `Actividades`. Ahora `Confirmar y preparar` busca el
   `id_calendar` del profesional y lo pasa explícito.
2. La hora iba sin zona. Ahora se arma como `2026-08-10T09:00:00-06:00` — Costa Rica es UTC-6
   todo el año, así que el offset explícito es determinista.
3. **`Citas.id_evento_calendar` no se escribía nunca.** `Guardar id del evento` saca la fila
   del rango que devolvió el append (`Citas!A28:R28` → 28) y escribe el id en la columna R.
   Sin eso, reprogramar y cancelar duplicarían el evento en vez de actualizarlo, que era el
   motivo entero de crear esa columna.

### Gotcha: `values:append` y las filas vacías

`values:append` cae **después de la última fila con datos**. Los ciclos de append + borrado
de las pruebas dejaron 14 filas vacías intercaladas (27–40) y las citas nuevas empezaron a
caer en la 41 y la 42, cada vez más lejos. No rompe nada —`Preparar datos` filtra las filas
vacías— pero la hoja se ve rota en el demo y el hueco solo crece.

Se compactó con `deleteDimension`. Verificado después: la cita siguiente cayó en la fila 28,
contigua, con su id de evento en la columna R.

---

## 7. El bug de "ya no está disponible" (2026-08-07)

Un espacio ofrecido y confirmado se rechazaba al reservarlo. En WhatsApp:

> — *(agente)* consulta y valoración el jueves 13 de agosto a las 4:00 p. m. …
> — *(paciente)* deseo reservar si
> — *(agente)* El jueves 13 de agosto a las 4:00 p. m. **ya no está disponible**.

**Las 16:00 nunca se ocuparon.** En la misma ejecución que dijo lo contrario (26306) el motor
tenía 18 espacios libres ese día, incluidas las 16:00. Eran **tres defectos apilados**:

| Ejec | Acción | `fecha_texto` que mandó el modelo | Motor |
|---|---|---|---|
| 26299 | consultar | `"de la proxima semana tiene espacios algun dia a las 4?"` | ✅ 16:00 lun–vie |
| 26306 | agendar | **`"el jueves"`** | `ambiguo` + `08:00, 08:30, 09:00, 09:30` |

1. **El modelo pierde la hora en el turno de confirmación (causa raíz).** El prompt le decía
   que pasara *las palabras textuales del paciente*. Esa regla se cae cuando el paciente solo
   dice "sí" o "dale": no hay palabras que pasar, el modelo reconstruye de memoria y recupera
   el día pero no la hora. Por eso era intermitente — con *"dale, el de las 4"* funcionaba.
2. **El fallback de `ambiguo` devolvía las 4 primeras del día, en orden cronológico**
   (`candidatos.slice(0, 4)`). Con 18 espacios libres, las 4 primeras son todas de la mañana:
   el espacio de la tarde que el paciente venía pidiendo desaparecía de la lista.
3. **El agente inventaba el "ya no está disponible".** El motor había dicho *"tengo varios
   espacios, ¿cuál prefiere?"*. `ambiguo` significa "decime cuál", no "está ocupado" — y el
   prompt no prohibía afirmar que algo estaba tomado.

### Lo que se cambió

| # | Dónde | Cambio |
|---|---|---|
| F | prompt, `# CÓMO USAR LA AGENDA` | **Excepción obligatoria a la regla textual**: si el paciente solo confirma, `fecha_texto` lleva el espacio completo con día **y hora** |
| G | prompt, regla de `ambiguo` | `ambiguo` ≠ ocupado. Si ya había hora elegida, **reintentar `agendar_cita`** con día + hora en el mismo turno |
| H | prompt, `# ERRORES…` | Prohibido decir "ya no está disponible" salvo con `motivo: "no_coincide"` |
| — | `Resolver slot pedido` | La muestra de `ambiguo` se **reparte a lo largo del día** en vez de las 4 primeras |

El muestreo toma 5 puntos equidistantes conservando el orden cronológico, así que el primero
y el último del día siempre entran. El mensaje pasó de *"tengo varios espacios: 08:00, 08:30,
09:00, 09:30"* a *"tengo 18 espacios libres, **por ejemplo**: 08:00, 10:00, 12:30, 14:30,
16:30"* — el "por ejemplo" y el conteo evitan que el modelo lea la lista como exhaustiva.

### Verificado

| Prueba | Resultado |
|---|---|
| `agendar` + `"el jueves"` (la llamada que fallaba) | `ambiguo` con `08:00, 10:00, 12:30, 14:30, 16:30` — la tarde ya se ve ✅ |
| `agendar` + `"el jueves 13 de agosto a las 4:00 p. m."` | Reserva `CITA-0026` a las **16:00** del 13, el espacio pedido ✅ |

La cita de prueba y su evento de Calendar se borraron después; `Citas` quedó en 25 filas.

> **Nota sobre el builder:** `construir-agenda.mjs` todavía tenía `disabled: true` en los dos
> nodos de Calendar (venían del Paso 3, cuando aún no existía la credencial). Volver a
> correrlo habría apagado el espejo que ya funciona. Se quitó, y se le puso la credencial
> `PTFrwFEcqS8cEEKT` al nodo para que el script quede idempotente de verdad.

---

## 8. Endurecido antes de agregar cancelar/reagendar/confirmar (2026-08-07)

Trabajo protector previo a las funcionalidades nuevas. La idea era simple: si van a entrar
3 acciones más y 2 workflows más, primero hay que blindar lo que ya funciona.

### La red de regresión (`regresion.mjs`)

**36 aserciones** que fijan el comportamiento actual. No compara salidas byte a byte —la
agenda cambia sola con los días— sino **invariantes**: la malla anclada a `duracion_min`, las
reglas de día, los feriados, el contrato de que nunca devuelve vacío, y el bug de `ambiguo`
del §7.

```
node regresion.mjs              solo lecturas, seguro a cualquier hora
node regresion.mjs --completo   agrega el camino de escritura (agenda y limpia)
```

Dos cosas que aprendió a la mala y que quedaron incorporadas:

- **El día de prueba se elige en caliente.** Fijarlo rompía la suite en cuanto el paciente ya
  tenía una cita ese día: el motor rechaza con `dos_citas_mismo_dia`, que es correcto pero no
  es lo que la prueba mide.
- **La limpieza va en `finally` y relee la hoja.** Una corrida murió por cuota justo después
  de reservar y dejó `CITA-0027` viva en la hoja del demo, con su evento en Calendar.

### Reintentos: no había ninguno

Los 8 nodos que llaman a Google estaban en `onError: stop` **sin un solo reintento**. Un
único `429` de cuota mataba la llamada y el agente se quedaba sin respuesta — justo la
condición que lo hace alucinar. Con 2 tools era improbable; con 5 pasa a probable.

| Nodo | Reintentos | Por qué |
|---|---|---|
| `Leer todo el CRM`, `Releer citas frescas` | 3 × 2 s | lecturas, idempotentes |
| `Guardar paciente`, `Escribir actividad`, `Actualizar oportunidad`, `Guardar id del evento` | 3 × 2 s | upsert por clave, idempotentes |
| `Crear evento en Calendar` | 2 × 2 s | un evento duplicado es cosmético |
| **`Escribir cita`** | **ninguno, a propósito** | `append` no es idempotente: un timeout después de que la fila entró duplicaría la cita. Que falle fuerte es mejor que una reserva doble silenciosa |

Las **tools del agente tampoco llevan reintentos**, por lo mismo: reintentar `agendar_cita`
volvería a correr el sub-workflow entero. Los reintentos van adentro, en los nodos concretos
que sí son idempotentes.

Que esto hacía falta quedó demostrado solo: la propia suite de regresión agotó la cuota
(`Quota exceeded for 'Read requests per minute per user'`) y se cayó. Ahora `sheets.mjs`
reintenta con espera de 15 s ante cuota y la suite se autolimita a una llamada cada 2,5 s.

### `onError` en las tools del agente

`consultar_disponibilidad` y `agendar_cita` estaban en `onError: stop`, a diferencia de
`catalogo_servicios`. Si el motor fallaba, reventaba la ejecución **entera** del agente en vez
de que el modelo recibiera el error y escalara. Ahora las tres tools se comportan igual.

### El callejón sin salida de la valoración previa

Lo encontró la primera corrida de la red. Un paciente nuevo que pedía una limpieza recibía
`requiere_valoracion_previa` con **`alternativas: []`** y un `mensaje` escrito para el modelo,
no para el paciente: *"Consulte la disponibilidad de la valoración para ofrecerle horarios."*
Dependía de que el modelo hiciera una segunda llamada — el mismo patrón frágil que ya había
causado los dos bugs anteriores. **Un contrato que depende de que el modelo haga algo es un
contrato roto.**

Arreglo: `Calcular slots libres` ahora calcula **también** la malla de `SRV-001` cuando el
servicio pedido no es una valoración, y `Validar reglas` devuelve esos horarios. Cuesta solo
CPU sobre datos ya leídos —ni una llamada más a Sheets— porque el generador de mallas se
parametrizó (`slotsDelDia(dia, paso, dur, team)`) en vez de duplicarlo en otro nodo.

Antes: *"…Consulte la disponibilidad de la valoración para ofrecerle horarios."*
Ahora: *"…Le puedo ofrecer: sábado 8 de agosto, 8:00 a. m., con Dra. Dulce María Vargas
Solano; sábado 8 de agosto, 8:30 a. m., …"*

### `guardar()` en `sheets.mjs`

El PUT que desactivó el bot el 2026-08-05 (§0) ahora es difícil de repetir: `guardar()`
**aborta** si el workflow tiene triggers habilitados con credencial, filtra las claves de
`settings` que la API rechaza, y **verifica después del PUT** que un workflow que estaba
activo siga activo. Todo script nuevo debería usarla en vez de armar el PUT a mano.

### Backups

`cambios/{Citas,Pacientes,Oportunidades,Actividades}-backup-2026-08-07.tsv` — los cuatro tabs
que van a escribir las funcionalidades nuevas.

---

## 9. Pendientes

1. **Reconectar la credencial `Trignia automations email`** y volver a habilitar
   `Archivo creado` y `Archivo actualizado`. Y hacerlo **antes** de guardar
   `Trignia whatsapp` (`BuwFfNVWsYVLyasgZfJ19`), que tiene la misma bomba armada. Ver §0.
2. **`Webhook de prueba` (`/agenda-test`) sigue habilitado.** Es la única vía para probar el
   motor aislado (la API pública no ejecuta workflows sin trigger de webhook/form/chat).
   Deshabilitalo antes de dar el demo.
3. **Sheets no da atomicidad.** Mitigado con la relectura antes de escribir; alcanza para un
   demo con un probador, no para producción real.
4. **Reprogramar y cancelar** con la política de 24 h y el cargo de 10.000 por cancelación
   tardía (`DM_04`). La columna `id_evento_calendar` ya está poblándose, así que el terreno
   está listo: para reprogramar hay que hacer `PATCH` del evento en vez de crear uno nuevo.
5. **Workflows programados**: recordatorio a 24 h y a 2 h, liberación de las citas sin
   confirmar a las 5:00 p. m. del día anterior, y ofrecimiento del espacio liberado a la
   `Lista de espera` en orden de solicitud con 2 horas de ventana. Es lo que más impresiona
   en el demo y lo que más trabajo lleva.
6. **`DM_03` dice que la colocación de brackets son 90 min**, pero `SRV-008`/`SRV-031` tienen
   `duracion_min = 30`, que es el control mensual. Se dejó en 30: el paciente nuevo pasa
   antes por valoración de todos modos.
7. **Al escalar, el paciente recibe el mensaje genérico de `Configuración Clínica`**, no el
   texto del agente (pendiente #5 del doc de catálogo). Si agendar falla y el agente escala,
   el paciente no se entera del motivo.
