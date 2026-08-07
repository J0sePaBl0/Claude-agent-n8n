# Cancelar, reagendar y confirmar citas — estado y cómo seguir

> **Para retomar en otra sesión.** Este archivo tiene todo el contexto necesario: qué se está
> construyendo, qué quedó hecho y verificado, qué está a medias, y el paso exacto por el que
> hay que empezar. Escrito el **2026-08-07**, sesión interrumpida a mitad del Paso 1.

---

## 0. Empezá por acá

**Lo primero que hay que hacer al retomar** es investigar un fallo concreto que quedó abierto,
descrito con su repro exacto en el §5. No arranques por el Paso 2 sin cerrar eso.

Antes de tocar nada:

```bash
cd scripts/agenda
node proxy.mjs crear      # crea el proxy temporal de Sheets (se borra al terminar)
node regresion.mjs        # 27 aserciones, ~1 min. TIENE que dar 27/27 antes de seguir.
```

Y al terminar la sesión, **siempre**:

```bash
node proxy.mjs borrar
```

---

## 1. Qué se está construyendo

Sobre el demo de la **Clínica Dental Dulce María** (bot de WhatsApp con agenda real contra
Google Sheets), se están agregando:

1. **Cancelar, reagendar y confirmar citas** — por WhatsApp *y* por correo.
2. **Correo de la cita** al reservarla, con botones de Confirmar / Reagendar / Cancelar.
3. **Correo recordatorio un día antes**, con el botón de confirmar.

El plan completo, con las decisiones y sus razones, está en
`C:\Users\PC\.claude\plans\agenda-ficticia-para-el-breezy-steele.md`. El contexto del motor
que ya existía está en [agenda-motor.md](agenda-motor.md) — **leelo, es la referencia
principal**, sobre todo §7 (el bug de `ambiguo`) y §8 (el endurecimiento).

### Decisiones ya tomadas por el usuario

| Decisión | Elegido |
|---|---|
| De dónde sale el correo del paciente | **El agente lo pide por WhatsApp** al agendar y lo guarda en `Pacientes.email`. `DM_04` ya dice que para facturar se pide nombre, cédula y correo, así que pedirlo es parte de la ficción |
| Alcance | **WhatsApp y correo**, las dos vías |
| Recordatorio del día antes | **Solo correo.** WhatsApp Business exige plantilla aprobada por Meta fuera de la ventana de 24 h, y el recordatorio cae justo fuera |

---

## 2. Coordenadas

| Qué | Valor |
|---|---|
| n8n | `https://n8n.trignia.com` (API key en `.mcp.json`, que está en `.gitignore`) |
| Sub-workflow del motor | `Agenda — disponibilidad y citas` → **`LsbRqfF2c32hVahw`** (45 nodos, activo) |
| Agente de WhatsApp | `Agente conversión y agenda` → **`GmGt3g3krJCoDli0`** (58 nodos, activo) |
| Sheet del CRM | `1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA` |
| Webhook de prueba del motor | `POST https://n8n.trignia.com/webhook/agenda-test` |
| Credencial Sheets | `OzuELp4CRMHcSYT8` — `trignia automations account` |
| Credencial Calendar | `PTFrwFEcqS8cEEKT` — `Google Calendar account` |
| Credencial Gmail | `JQv3rDJEhLKRGdQ7` — `Gmail trignia automations` |

### Columnas de `Citas` (A:S)

```
A id_cita              H fecha                O creada_por
B id_paciente          I hora_inicio          P fecha_creacion
C id_profesional       J hora_fin             Q notas
D id_servicio          K estado               R id_evento_calendar
E id_tratamiento       L canal_agendamiento   S token_gestion   ← NUEVA
F id_oportunidad       M recordatorio_enviado
G sede                 N confirmada_por_paciente
```

`estado` sale de los enums de `Config!R`: `Solicitada | Confirmada | Reprogramada |
Cancelada | Completada | No asistió`. No hay que inventar valores.

---

## 3. Los scripts (`scripts/agenda/`)

Se movieron al repo justamente porque el scratchpad de una sesión no sobrevive a la
siguiente. **Correlos siempre desde `scripts/agenda/`**, porque los builders leen `code/*.js`
por ruta relativa.

| Script | Para qué |
|---|---|
| `sheets.mjs` | Helper compartido. Lee/escribe el Sheet vía proxy y llama a la API de n8n. Exporta `guardar()`, que es **la única forma correcta de hacer un PUT** (ver §6) |
| `proxy.mjs crear\|borrar` | Crea/borra el workflow temporal que da acceso a Sheets |
| `regresion.mjs [--completo]` | **La red de seguridad.** 27 aserciones de lectura; con `--completo`, 36 incluyendo escritura |
| `paso0-gestion.mjs --apply` | Crea `Citas!S` y rellena los tokens. **Ya se corrió** |
| `paso1-gestion.mjs --apply` | Agrega los 13 nodos de gestión al motor. **Ya se corrió**, es idempotente |
| `endurecer.mjs --apply` | Reintentos + `onError` en las tools. **Ya se corrió** |
| `construir-agenda.mjs` | Builder original del sub-workflow. **⚠️ NO correrlo, ver §6** |
| `probar.mjs "mensaje"` | Manda un mensaje al agente como si fuera Chatwoot. **Manda un WhatsApp real** |
| `ver-respuesta.mjs` | Muestra qué contestó el agente y si llamó a las tools |
| `compactar-citas.mjs --borrar CITA-00XX --apply` | Borra una cita de prueba y su evento de Calendar |

---

## 4. Qué quedó hecho y verificado

### Endurecimiento previo (completo, verificado)

Detalle en [agenda-motor.md §8](agenda-motor.md). Resumen:

- **Red de regresión** `regresion.mjs`, 36 aserciones.
- **Reintentos** en los 7 nodos idempotentes que llaman a Google. `Escribir cita` **no** lleva,
  a propósito: `append` no es idempotente. Las tools del agente tampoco, porque reintentar
  `agendar_cita` re-ejecutaría el sub-workflow entero.
- **`onError: continueRegularOutput`** en `consultar_disponibilidad` y `agendar_cita`.
- **Arreglado un callejón sin salida**: `requiere_valoracion_previa` devolvía `alternativas: []`.
- **`guardar()`** en `sheets.mjs`.
- **Backups** en `cambios/{Citas,Pacientes,Oportunidades,Actividades}-backup-2026-08-07.tsv`.

### Paso 0 — datos (completo)

- `Citas!S` = `token_gestion` creada, **26 tokens únicos** generados (uno por cita existente).
- El token es lo único que viaja en el enlace del correo. Identifica la cita sin exponer ids
  internos ni permitir adivinar la de otro paciente.

### Paso 1 — motor (construido; confirmar y las rutas de fallo, verificados)

El sub-workflow pasó de **32 a 45 nodos**. Lo viejo quedó intacto: `regresion.mjs` da 27/27.

**Cómo quedó el grafo** (lo nuevo en **negrita**):

```
Normalizar entrada → Leer todo el CRM → Preparar datos → Interpretar la fecha
  → **Localizar cita** → **¿Cita localizada?** ──[no]──→ Respuesta
        └─[sí]─→ Calcular slots libres → ¿Motor OK? ──[no]──→ Respuesta
              └─[sí]─→ **¿Qué acción?** (Switch de 5)
                   ├─0 consultar_disponibilidad → Ordenar por cercanía → Respuesta
                   ├─1 agendar    → Validar reglas → … (cadena original intacta)
                   ├─2 confirmar ─┐
                   ├─3 cancelar  ─┼─→ **Preparar gestión**
                   └─4 reagendar → Resolver slot pedido → ¿Slot resuelto?
                                     └─[sí]→ **¿Agendar o reagendar?**
                                              ├─0 agendar   → Releer citas frescas → …
                                              └─1 reagendar → **Preparar gestión**

**Preparar gestión** → **Aplicar cambios en Citas** → **¿Borrar evento?**
   → **Borrar evento de Calendar** → **¿Crear evento?** → **Crear evento reagendado**
   → **Guardar id del evento nuevo** → **Actividad de gestión**
   → **Escribir actividad de gestión** → **Respuesta gestión** → Respuesta
```

**Decisiones de diseño que importan:**

- **No se duplicó el motor de espacios.** Reagendar reusa `Interpretar la fecha`,
  `Calcular slots libres` y `Resolver slot pedido` tal cual.
- **`Localizar cita` va DESPUÉS del resolver de fechas**, para poder desambiguar "la del
  jueves" reusando esa pieza en vez de escribir un mini-parser.
- **`Preparar gestión` es UN nodo con un `if` adentro, no tres.** Con tres nombres distintos,
  la cola compartida no podría referenciar al que corrió.
- **Ninguna acción recibe `id_cita` del modelo.** Se localiza por teléfono o por token. Cada
  dato que el modelo no llena es un dato que no puede inventar.
- **Reagendar mueve la misma fila** (`estado = Reprogramada`), no cancela y crea otra: el
  `id_cita` y el token del correo siguen sirviendo. El evento de Calendar sí se borra y se
  recrea, porque si cambió el profesional cambió el calendario.
- **Al reagendar el servicio sale de la cita, no del modelo** (`Calcular slots libres` lee
  `$('Localizar cita').first().json.id_servicio`).

**Verificado en la instancia:**

| Caso | Resultado |
|---|---|
| `confirmar` con teléfono sin citas | `sin_citas` + invitación a agendar ✅ |
| `cancelar` con token inventado | `token_invalido`, sin tocar nada ✅ |
| `confirmar` con teléfono de Jp | `estado = Confirmada`, `confirmada_por_paciente = TRUE`, fila `ACT-00106` en `Actividades` ✅ |
| Regresión completa de lo viejo | 27/27 ✅ |

---

## 5. ⚠️ LO QUE QUEDÓ ABIERTO — empezá por acá

**`reagendar` devolvió `no_coincide` y no se llegó a diagnosticar.** Repro exacto:

```bash
curl -X POST https://n8n.trignia.com/webhook/agenda-test \
  -H 'content-type: application/json' \
  -d '{"accion":"reagendar","token":"<token de CITA-0026>","fecha_texto":"el viernes 14 de agosto a las 9:00 a. m.","id_servicio":"","telefono":"","nombre_paciente":""}'
```

Devolvió:
```
ok: false | motivo: no_coincide
mensaje: Ese espacio ya no está disponible. Le puedo ofrecer sábado 8 de agosto, 8:00 a. m., …
```
Y la hoja no cambió (correcto: falló antes de escribir).

**No está confirmado que sea un bug.** `no_coincide` sale de `Resolver slot pedido` cuando
`candidatos` queda vacío tras filtrar por día y hora, y es posible que las 09:00 del viernes
14 estén genuinamente ocupadas para todos los profesionales de `SRV-001`. **Hay que
descartar eso primero**, así:

1. `consultar_disponibilidad` con `id_servicio: 'SRV-001'` y
   `fecha_texto: 'el viernes 14 de agosto'` → mirar si 09:00 aparece entre los espacios.
2. Si aparece, es un bug de la rama de reagendar. El sospechoso número uno es que
   `Resolver slot pedido` en la rama de reagendar recibe como `motor` la salida de
   `¿Motor OK?` (o sea, `Calcular slots libres`), mientras que en la rama de agendar recibe
   la de `Validar reglas`, que hace `{...motor}` más campos. Verificar que `slots` llegue
   igual en las dos.
3. Si 09:00 no aparece, repetir con una hora que sí esté libre y seguir adelante.

**Ojo con un detalle real del dominio:** al reagendar, la propia cita ocupa su espacio actual,
así que el motor la ve como ocupada. Habría que **excluir la cita que se está moviendo** de
las ocupadas, o el paciente no puede "reagendar" a su misma hora con otro profesional.
Esto **no está implementado** y es un caso a cubrir.

Después de eso falta probar `cancelar` (con y sin las 24 h de `DM_04`) contra una cita de
prueba propia, nunca contra `CITA-0026`.

---

## 6. Trampas que ya costaron caro

1. **Un PUT sobre un workflow activo lo DESACTIVA** si algún trigger habilitado tiene la
   credencial vencida. Tumbó el bot de WhatsApp el 2026-08-05. **Usá siempre `guardar()` de
   `sheets.mjs`**, que aborta si detecta ese caso y verifica que el workflow siga activo
   después. Nunca armes el PUT a mano.
2. **⚠️ NO corras `construir-agenda.mjs`.** Reconstruye el sub-workflow desde cero y **no
   conoce los 13 nodos de gestión ni los reintentos**: los borraría. Está pendiente
   actualizarlo (Paso 1b) para que vuelva a ser fuente única. Mientras tanto, la fuente real
   es la instancia.
3. **Al reescribir conexiones, tocá solo las salidas que vas a cambiar.** Borrar `main`
   completo perdió las ramas de error de `¿Motor OK?` y `¿Slot resuelto?` hacia `Respuesta`, y
   el webhook empezó a contestar `"No item to return was found"`. Lo cazó la regresión.
   `paso1-gestion.mjs` ya trae la lógica correcta y una verificación de conexiones huérfanas.
4. **Google Sheets: 60 lecturas por minuto por usuario.** Cada llamada al motor gasta ~2.
   `regresion.mjs` se autolimita a una llamada cada 2,5 s y `sheets.mjs` reintenta con 15 s de
   espera. Con 5 acciones esto se va a apretar más.
5. **Toda limpieza de prueba va en `finally` y releyendo la hoja.** Una corrida murió por
   cuota justo después de reservar y dejó una cita viva en el demo con su evento en Calendar.
6. **Nunca `deleteDimension` con índice inválido**: `-1` es Bad Request y `0` borraría los
   encabezados.
7. **`Citas` se escribe con `RAW`, nunca con el nodo normal de Sheets.** Con `USER_ENTERED`,
   Google convierte `"08:30"` en hora y lo devuelve como `"8:30"`.
8. **La API pública rechaza `settings` con claves que no conoce** (`availableInMCP`,
   `binaryMode`). `guardar()` ya las filtra.
9. **El tab de la sede se llama `Config`, no `Sedes`**, y desde la columna `L` tiene 20
   columnas de enums: escribir más ancho que `A2:I2` las borra.
10. **`toolWorkflow` v2.2 no tiene propiedad `name`**: el nombre que ve el modelo es el nombre
    del nodo.

### El principio que resume tres bugs seguidos

**Un contrato que depende de que el modelo haga algo es un contrato roto.** Si una tool
devuelve algo incompleto esperando que el modelo dé un paso más, a veces lo da y a veces no.
Los `mensaje` se redactan **para el paciente**, nunca como instrucciones para el modelo. Las
listas truncadas mienten: si devolvés una muestra, decí el total y aclará que son ejemplos.

---

## 7. Lo que falta

### Paso 1b — devolverle la fuente única al builder
Meter en `construir-agenda.mjs` los 13 nodos de gestión y los `retryOnFail`, para que volver a
correrlo reproduzca el estado real. Hoy correrlo es destructivo (§6.2).

### Paso 2 — tools del agente y prompt

Tres nodos `toolWorkflow` **v2.2** nuevos al mismo sub-workflow:

| Nodo | `accion` | Por `$fromAI()` | Por expresión |
|---|---|---|---|
| `confirmar_cita` | `confirmar` | — | `telefono` |
| `cancelar_cita` | `cancelar` | — | `telefono` |
| `reagendar_cita` | `reagendar` | `fecha_texto` | `telefono` |

Y **`agendar_cita` gana un campo `email`** por `$fromAI()`; hay que agregarlo también al mapeo
de `Guardar paciente`, que hoy escribe 8 campos y ninguno es el correo.

Reemplazos al prompt (`cambios/system-message-agente-clinica.txt`, hoy 15.641 caracteres):

| # | Sección | Cambio |
|---|---|---|
| I | `# HERRAMIENTAS DISPONIBLES` | Las 3 tools nuevas |
| J | `# CÓMO USAR LA AGENDA` | Pedir el correo antes de `agendar_cita`, justificándolo como `DM_04`: es para la factura electrónica. Si no lo quiere dar, agendar igual |
| K | `# CÓMO USAR LA AGENDA` | Nunca preguntar *cuál* cita (la herramienta la localiza); con `ambiguo` repreguntar con la lista; con `sin_citas` ofrecer agendar |
| L | `# CÓMO USAR LA AGENDA` | Política de 24 h de `DM_04`: avisar del cargo de ₡10.000 **antes** de cancelar, y cancelar igual si el paciente confirma |
| M | `# ERRORES QUE NO DEBES COMETER` | Cancelar sin avisar del cargo; decir que no tiene citas sin haber llamado a la herramienta; inventar un `id_cita` |

> ⚠️ **El prompt llega a ~18.000 caracteres.** Es el riesgo de calidad más probable. Conviene
> comprimir las secciones de precios (ya llevan 8 parches acumulados) antes de agregar, y
> verificar con `probar.mjs` + `regresion.mjs`.

### Paso 3 — workflow de correos

Workflow nuevo `Clínica — Correos de citas`. Nodo `n8n-nodes-base.gmail` v2.2 con cuerpo HTML
(el patrón ya está probado en `Send a message` del agente, que manda el correo de
escalamiento). Dos entradas:

- **`executeWorkflowTrigger`** — lo llama el motor al final de `agendar` y de `reagendar`.
  Entradas: `id_cita`, `tipo` (`nueva` | `reprogramada` | `cancelada`).
- **`scheduleTrigger` diario a las 09:00** `America/Costa_Rica` — el recordatorio. Busca las
  citas de mañana con `recordatorio_enviado = FALSE` y estado `Solicitada`/`Confirmada`, manda
  el correo y marca `Citas!M{fila} = TRUE`. Las 09:00 encajan con `DM_03`, que pone el límite
  para confirmar a las 5:00 p. m. del día anterior.

Cuerpo: datos de la cita, dirección y `link_maps` de `Config!A:I`, la política de 24 h, y tres
botones:

```
Confirmar → /form/gestionar-cita?token=<T>&accion=Confirmar%20asistencia
Reagendar → /form/gestionar-cita?token=<T>&accion=Reagendar
Cancelar  → /form/gestionar-cita?token=<T>&accion=Cancelar
```

**Caveat:** sale de `trigniaautomations@gmail.com`, no de `citas@dentaldulcemaria.cr` como
dice `DM_01`. Se mitiga con el nombre visible del remitente y un `Reply-To`.

**Divergencia con el RAG:** `DM_03` dice que la confirmación es **por WhatsApp**. El bot puede
seguir diciéndolo porque lo lee del RAG. Decidido: **se acepta**, y el prompt dice "por
WhatsApp o por correo" en vez de editar el PDF y re-sincronizar.

### Paso 4 — formulario de gestión

Workflow nuevo `Clínica — Gestión de cita por correo`.

```
Form Trigger  /gestionar-cita
   token   → Hidden Field  (lo llena el query param del enlace)
   accion  → Dropdown: Confirmar asistencia | Reagendar | Cancelar
   opciones: Ignore Bots = ON, Respond When = Workflow Finishes
 → Motor (accion correspondiente) → Switch
     ├── Confirmar → Form Ending
     ├── Cancelar  → Form page "¿Confirma?" (+ aviso del cargo si <24 h) → Motor → Form Ending
     └── Reagendar → Motor(consultar) → Armar opciones (Code)
                     → Form page con los espacios → Motor(reagendar) → Form Ending
```

**Las tres piezas técnicas, ya verificadas contra la instancia:**

1. **El Form Trigger tiene `Hidden Field` poblable por query param**, y *cada página del
   formulario recibe los mismos parámetros*. Así viaja el token sin mostrárselo al paciente.
2. **`n8n-nodes-base.form` v2.5 acepta `defineForm: "json"`**, y `jsonOutput` admite una
   expresión. El "calendario" de reagendamiento se genera al vuelo:
   ```js
   ={{ JSON.stringify([{ fieldLabel: '¿Cuál espacio le sirve?', fieldType: 'radio',
        requiredField: true,
        fieldOptions: { values: $json.alternativas.map(s => ({ option: s.texto })) } }]) }}
   ```
   Los `texto` ya vienen formateados en español por el motor, así que la opción elegida se
   resuelve de vuelta contra `alternativas` por igualdad exacta.
3. **`Ignore Bots`**, junto con exigir un submit real (POST), neutraliza el problema que ya
   apareció en el proyecto de Applica: Outlook Safe Links y los previsualizadores hacen GET a
   todos los enlaces de un correo. **Un prefetch no puede cancelar una cita.** Es la razón por
   la que esto es un formulario y no un webhook de un clic.

### Fuera de alcance (decidido)

- Recordatorio adicional 2 horas antes (`DM_03`).
- Cobro real del cargo y el conteo de 3 ausencias (`DM_04`).
- Ofrecimiento a la `Lista de espera` y liberación automática a las 5:00 p. m.
- Plantilla de WhatsApp aprobada por Meta.

---

## 8. Estado de los datos (importante)

`Citas` tiene **26 filas**, la última `CITA-0026`.

**`CITA-0026` es del usuario**, no de las pruebas: la reservó por WhatsApp el 2026-08-07 a las
15:25 (jueves 13 de agosto, 10:00, PROF-03). **Las pruebas de esta sesión la modificaron**:
pasó de `Solicitada` / `confirmada_por_paciente = FALSE` a **`Confirmada` / `TRUE`**, y quedó
`ACT-00106` en `Actividades`. Si el demo la necesita en el estado original, hay que revertir
esas dos celdas (`Citas!K27` y `Citas!N27`).

`PAC-0021` "Jp" sigue registrado como paciente. Mientras esté, ese número **no dispara la
regla de valoración previa**. Si el demo tiene que mostrar esa regla, hay que borrarlo.

Backups del estado previo en `cambios/*-backup-2026-08-07.tsv`.
