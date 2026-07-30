# Catálogo de servicios como herramienta del agente

**Workflow:** `Agente conversión y agenda` (`GmGt3g3krJCoDli0`) — ACTIVO
**Objetivo:** que los servicios y precios salgan del Sheet `CRM - demo`, no del RAG.
**Estado: APLICADO Y PUBLICADO el 2026-07-30.** 55 → 56 nodos.

> **Cómo se aplicó:** por REST API (`PUT /api/v1/workflows/{id}`), no por el MCP.
> El update parcial del MCP falla siempre contra esta instancia, y el update completo
> del MCP habría borrado `pinData` y `staticData`. El PUT directo los conserva —también
> conserva las `settings` que no se mandan (`availableInMCP`, `binaryMode`): n8n hace merge.
> Backup previo en el scratchpad de la sesión (`backup-GmGt3g3krJCoDli0.json`).
>
> El PUT **publica** el draft. En este caso se publicaron además 5 cambios que ya estaban
> sin publicar, todos benignos: posiciones de 3 nodos, el alto de una sticky, y la
> corrección de la carpeta de `Archivo actualizado` (ver Pendientes #3, ya resuelto).

---

## Por qué herramienta y no inyectado en el prompt

Una búsqueda vectorial devuelve las k coincidencias *más parecidas* — por eso el RAG no
sirve para precios. Un nodo de Google Sheets colgado del agente es una **lectura
determinista**: trae las filas exactas. Resuelve lo mismo y además:

- No hay que reconectar la cadena principal — solo se cuelga del puerto Tool.
- No se pagan ~800 tokens en cada turno (`contextWindowLength` está en 20).
- Escala si la clínica pasa de 17 servicios.

**El costo:** el modelo tiene que acordarse de llamarla. Se mitiga con reglas duras en el
prompt (abajo) y con la regla de escalar si no obtuvo el dato de la herramienta. El mismo
patrón ya funciona en este agente con `base_de_datos`.

---

## 1. Nodo nuevo: `catalogo_servicios`

Nodo **Google Sheets Tool** (`n8n-nodes-base.googleSheetsTool` v4.7) colgado del puerto
**Tool** de `Agente de clínica` por una conexión `ai_tool`. Posición `[816, 480]`.

> ⚠️ **Tiene que ser la variante `...Tool`, no el nodo normal.** Con
> `n8n-nodes-base.googleSheets` el agente revienta en **todos** los mensajes —incluso un
> "hola"— con `Node does not have a 'supplyData' method defined`. El fallo cae en el
> fallback de `Validar Salida del Agente`, que escala, y la conversación queda en `pending`
> sin que el bot vuelva a contestar hasta que alguien la reabra.
>
> El validador del MCP avisa de esto con `cannot output ai_tool connections`. **No es
> falso positivo para nodos normales.** Solo lo es para `base_de_datos`, que es un vector
> store en modo `retrieve-as-tool` y sí implementa `supplyData`. La regla real: un nodo
> puede colgarse del puerto Tool solo si su tipo termina en `Tool` o si implementa
> `supplyData` (vector stores, sub-workflows). `search_nodes` del MCP no indexa las
> variantes `...Tool`, así que no encontrarlas ahí no prueba que no existan.

| Campo | Valor |
|---|---|
| Credential | `trignia automations account` (`OzuELp4CRMHcSYT8`) |
| Operation | **Get Row(s)** (el default de v4 — no lleva clave `operation`) |
| Document | By ID → `1k30yy6Z3II5THVeqLe8dLUiAxhu0TlE6ulNyySbm7tA` (`CRM - demo`) |
| Sheet | By name → `Servicios` |
| Filters | **ninguno** |
| On Error | Continue (using regular output) |

**Importante:** todos los campos con valor fijo, **sin `$fromAI()`**. Si el modelo arma el
filtro puede consultar mal y concluir que un servicio no existe. Que traiga siempre las
17 filas: es un resultado chico y no se puede equivocar.

El nombre del nodo es lo que ve el modelo, por eso es `catalogo_servicios` y no
"Get row(s) in sheet".

**Tool Description** (los nombres de columna son los reales de la hoja — verificados
contra el Sheet, no inventados):

```
Catálogo oficial de servicios de la clínica. Devuelve TODAS las filas, una por servicio, con estas columnas:
- id_servicio: identificador del servicio (formato SRV-XXX)
- nombre, categoria, descripcion
- duracion_min: duración de la sesión en minutos
- precio_desde y precio_hasta: rango de precio
- moneda: siempre CRC (colones costarricenses)
- num_sesiones: cuántas sesiones lleva el tratamiento completo
- requiere_valoracion: TRUE si necesita una valoración previa
- profesionales_habilitados: ids de los profesionales que lo realizan
- activo: TRUE si la clínica lo ofrece hoy

Úsala SIEMPRE que el paciente pregunte por un servicio, su precio, cuánto dura o cuántas sesiones lleva. Es la única fuente válida de precios.
```

---

## 2. System message del agente

El prompt vivo está en [system-message-agente-clinica.txt](system-message-agente-clinica.txt)
(copia exacta de lo que quedó en producción, 9.800 caracteres). Ese archivo es la
referencia para diffear contra la instancia; este documento solo explica qué cambió.

No se reemplazó el prompt completo: se hicieron **7 reemplazos quirúrgicos** sobre el que
ya estaba (A–E al conectar la herramienta, F–G al cargar el catálogo real), para no perder
nada de lo que había (límites de seguridad, salida estructurada, manejo del historial
contaminado).

| # | Sección | Cambio |
|---|---|---|
| A | `# FUENTE ÚNICA DE CONOCIMIENTO` → `# FUENTES DE CONOCIMIENTO (son dos y no se mezclan)` | Separa `catalogo_servicios` (servicios, precios, duración, sesiones, valoración) de `base_de_datos` (todo lo demás). Incluye las reglas duras: llamarla antes de cotizar, no cotizar de memoria, ignorar `activo = FALSE`, presentar rango y no precio cerrado, escalar si el servicio no aparece o la herramienta falla |
| B | `# HERRAMIENTAS DISPONIBLES` | Agrega `catalogo_servicios` y acota `base_de_datos` a "todo lo que no sean servicios ni precios" |
| C | `# CUÁNDO ESCALAR` | Nuevo motivo: servicio que no está en el catálogo, o herramienta caída/vacía → `informacion_no_disponible` |
| D | `# FLUJO DE CONVERSACIÓN` | Los pasos 3–5 pasan a 3–6: se bifurca "consulta de servicio/precio" (catálogo) de "otra consulta" (RAG), y agendar ahora confirma primero contra el catálogo |
| E | `# ERRORES QUE NO DEBES COMETER` | Tres entradas nuevas al principio: dar un precio sin haber llamado a la herramienta en ese mismo turno, inventar o "acercar" un servicio, y usar `base_de_datos` para precios |
| F | Regla de precios dentro de `# FUENTES DE CONOCIMIENTO` | Sustituye el "siempre presentá un rango, nunca un precio cerrado" —que dejó de ser cierto al cargar el catálogo real— por las 4 formas de leer un precio (fijo / desde / rango / prima+mensualidad), la regla de **unidad** (por pieza, cuadrante o arcada) y el costo de la cita de valoración |
| G | `# ERRORES QUE NO DEBES COMETER` | Entrada nueva: dar un precio por pieza/cuadrante/arcada como si fuera el total del tratamiento |
| H | Precedencia sobre el RAG, dentro de `# FUENTES DE CONOCIMIENTO` | El catálogo manda **en materia de precios**: si un servicio no está o está inactivo, no se cotiza aunque `base_de_datos` mencione una cifra. Con una salvedad explícita: eso aplica al precio, **no** a si la clínica hace el procedimiento — y urgencias se atienden siempre. Además, no poder dar un precio ya es motivo de escalar, en vez de cerrar con "le informarán en la clínica" y `escalar=false` |

Lo demás quedó **literal**: ROL E IDENTIDAD, JERARQUÍA DE PRIORIDADES, LÍMITES DE
SEGURIDAD 1–3, ENTREGA DE INDICACIONES, SALIDA ESTRUCTURADA, ESTILO Y FORMATO y SI ALGO FALLA.

---

## 2b. Carga del catálogo real (2026-07-30)

El tab `Servicios` tenía 17 filas inventadas del demo. Se reemplazó por el catálogo real de
[tratamientos_precios.txt](tratamientos_precios.txt): **38 servicios, 35 activos**.
Respaldo del estado anterior en [servicios-backup-2026-07-30.tsv](servicios-backup-2026-07-30.tsv);
lo cargado, en [servicios-2026-07-30.tsv](servicios-2026-07-30.tsv).

**Se reusaron los 17 `SRV-XXX` que ya existían**, remapeándolos al servicio real que les
corresponde. `Citas`, `Tratamientos`, `Oportunidades` y `Lista de espera` apuntan a esos
ids: renumerar habría dejado referencias colgando en todo el demo. Los 21 servicios nuevos
son `SRV-018` … `SRV-038`.

**Dos columnas nuevas al final: `prima` y `mensualidad`** (solo las llevan `SRV-008` brackets
metálicos y `SRV-031` zafiro, que se cobran con prima inicial + cuota mensual). Van al final
para no correr las 12 columnas anteriores; el nodo del CRM que lee esta hoja es una lectura,
no un `appendOrUpdate`, así que no hay caché de `columns.schema` que invalidar.

**Convención de precios** — el prompt la conoce y hay que respetarla al editar la hoja:

| En la fila | Significa | El agente dice |
|---|---|---|
| `precio_desde` = `precio_hasta` | precio fijo de referencia | "cuesta X" |
| `precio_hasta` vacío | mínimo | "desde X" |
| `precio_desde` ≠ `precio_hasta` | rango | "entre X y Y" |
| `prima` y `mensualidad` con valor | financiado | "prima de X más mensualidad de Y" |

**La unidad va en `descripcion`** en mayúsculas (POR PIEZA, POR CUADRANTE, POR ARCADA). Es
lo que evita que el agente cotice 35.000 por una limpieza profunda de boca completa, que en
realidad son 4 cuadrantes. Si se agrega un servicio que se cobra por unidad, hay que
escribirlo así.

**Desactivados** (`activo = FALSE`, la fila se conserva para no romper referencias):
`SRV-012` puente dental, `SRV-014` radiografía (va incluida en la valoración) y `SRV-015`
urgencia por dolor. Ninguno aparece en el documento oficial.

**Cómo se escribió:** el MCP de Drive no puede escribir rangos de una hoja existente. Se creó
un workflow temporal en n8n (webhook → HTTP Request a `sheets.googleapis.com/v4/.../values/Servicios!A1:N39`
con `valueInputOption=RAW`, autenticado con la credencial `googleSheetsOAuth2Api` que ya
existía), se disparó y se borró. 546 celdas. El script quedó en el scratchpad de la sesión
(`seed.mjs` / `leer.mjs`) por si hay que repetirlo.

**Efecto en el CRM:** `W8A2NHCABxlNWCph` lee esta misma hoja y ya filtra por `activo`, así
que las 3 filas desactivadas quedan fuera solas y la lista blanca `ids_validos` sigue
correcta. Mejora sola: ahora el clasificador tiene 35 servicios donde antes tenía 17,
incluida `SRV-022` incrustación de porcelana — el servicio que no pudo clasificar en la
prueba del usuario.

---

## 3. Verificar

Borrá primero el historial del número de prueba con `Ejecutar: Historial jp`, para que
el modelo no arrastre respuestas viejas.

| Mensaje | Esperado |
|---|---|
| `¿cuánto cuesta una limpieza?` | 25.000 colones, precio fijo. NO un rango |
| `¿hacen incrustaciones de porcelana?` | Sí: 180.000 por pieza. Es el caso que falló antes de cargar el catálogo real |
| `¿cuánto cuesta la limpieza profunda?` | 35.000 **por cuadrante**, y que aclare que la boca completa son 4 cuadrantes. Si dice "35.000" a secas, la regla de unidad no está funcionando |
| `¿cuánto sale la ortodoncia?` | Prima de 180.000 más mensualidad de 45.000, 18 a 24 meses. Si solo da el total 990.000–1.260.000, no está leyendo `prima`/`mensualidad` |
| `¿me pueden sacar una radiografía panorámica?` | `SRV-014` está en `activo = FALSE` → debe ignorarla y escalar, no cotizar 10.000–18.000 |
| `¿cuánto cuesta la cita de valoración?` | 15.000, y que mencione que es gratuita si inicia ortodoncia o implantes dentro de 30 días |

En la ejecución, confirmá que aparece la llamada a `catalogo_servicios` en el detalle del
agente. Si responde un precio **sin** esa llamada, hay que endurecer el prompt.

**Verificado el 2026-07-30** contra la instancia, disparando el webhook de producción:
- `cuanto cuesta una limpieza?` → *"cuesta 25.000 colones… dura aproximadamente 45 minutos.
  Este es un precio de referencia"*. Precio fijo, no rango. `escalar: false`. ✅
- `cuanto cuesta la limpieza profunda?` → *"35.000 colones **por cuadrante**. La boca
  completa tiene 4 cuadrantes, por lo que el tratamiento requiere 4 sesiones"*. La regla de
  unidad funciona y no multiplicó por su cuenta. ✅
- `cuanto sale la ortodoncia con brackets metalicos?` → *"total estimado entre 990.000 y
  1.260.000… prima inicial de 180.000 más mensualidades de 45.000… 18 a 24 meses, con citas
  de control cada cuatro semanas"*. Lee `prima` y `mensualidad`. ✅
- `me pueden sacar una radiografia panoramica?` → **falló la primera vez**: describió el
  servicio desde el RAG y cerró con `escalar: false` sin dar precio. Tras el reemplazo H →
  *"está incluida en la cita de valoración inicial, que cuesta 15.000 colones"*. ✅
- `tengo un dolor de muela fuertisimo, atienden urgencias?` → *"sí atiende urgencias. Tenemos
  dos espacios reservados cada día…"* + `escalar: true`, `tema_clinico_sensible`, sin
  inventar precio. ✅

**Para reproducir un mensaje sin WhatsApp**: POST del payload de Chatwoot a
`https://n8n.trignia.com/webhook/whatsapp-clinica-demo` (script `probar.mjs` del scratchpad).
Para limpiar la memoria del número entre pruebas, POST de un evento
`{event: "conversation_status_changed", status: "resolved", id: 10, …}` al mismo webhook —
dispara `Reiniciar Memoria de Sesión`— y después reabrir la conversación.

**Si la conversación queda trabada en `pending`**, el bot no vuelve a responder aunque el
workflow esté bien: el guardia `¿Bot Puede Responder?` solo deja pasar `status = open`. Se
reabre con `POST {url_chatwoot}api/v1/accounts/2/conversations/{id}/toggle_status` y body
`{"status":"open"}`, header `api_access_token`.

---

## 4. Pendientes relacionados

1. **Precios duplicados en el RAG.** Carpeta `1Tfe8bUGgG2yFB4gvo1kM0r-FsOoOuyCQ`, revisada
   el 2026-07-30. Son 5 PDFs (`DM_01` general, `DM_03` agenda, `DM_04` políticas y pagos,
   `DM_05` FAQ, `DM_06` cuidados post). No hay un catálogo de precios completo —falta `DM_02`
   en la numeración, así que parece que ya se sacó— pero **`DM_05_preguntas_frecuentes.pdf`
   repite tres precios**: limpieza 25.000, limpieza profunda 35.000 por cuadrante, y consulta
   de niño 12.000. Hoy coinciden con el Sheet, pero son una bomba de tiempo: al cambiar un
   precio en la hoja, el RAG lo va a contradecir en silencio. Hay que quitar esas cifras del
   FAQ (dejando la respuesta sin monto) y re-sincronizar con `p92vLPvE7MJZ0OYj`.
   Los montos de **políticas** en `DM_04` (10.000 por cancelación tardía, umbral de 300.000
   para planes de pago) **sí deben quedarse en el RAG**: no son precios de servicios.

2. **La herramienta `agenda` sigue sin existir.** El prompt la describe pero el agente
   solo tiene conectados `base_de_datos` y `catalogo_servicios`. Si todavía no se va a
   construir, hay que borrar esas líneas del prompt: el modelo puede prometerle al
   paciente que revisa la agenda y después inventar horarios. Es el riesgo abierto más
   grande de este workflow.

3. ~~El trigger `Archivo actualizado` vigila la carpeta equivocada.~~ **RESUELTO** — ya
   apunta a `1Tfe8bUGgG2yFB4gvo1kM0r-FsOoOuyCQ` ("Agente - Clínica Dulce María"). La
   corrección estaba en el draft sin publicar y se publicó junto con este cambio.

4. **El tab `Profesionales` es ficción del demo.** `DM_01_informacion_general02.pdf` trae los
   profesionales reales, que son **4 y con otros nombres**: Dra. Dulce María Vargas Solano
   (general y estética, lun–vie y sábados alternos), Dr. Andrés Zeledón Mora (endodoncia,
   mar y jue), Dra. Carolina Jiménez Ureña (ortodoncia, lun/mié/vie por la mañana) y Dr.
   Felipe Arias Rojas (cirugía e implantes, mié tarde y sábados por cita). El Sheet tiene
   `PROF-01`…`PROF-06` con nombres inventados, así que la columna
   `profesionales_habilitados` que se cargó apunta a personas que no existen. Sin resolver:
   arreglarlo implica tocar `Profesionales`, `Citas` y `Tratamientos`.

5. **Al escalar, el paciente NO recibe la respuesta que redactó el agente**, sino el mensaje
   genérico de `Configuración Clínica`. Es el diseño existente (está en la sticky), pero se
   nota feo en urgencias: el agente redacta "sí atendemos urgencias, hay dos espacios
   diarios, coordine por WhatsApp" y al paciente le llega solo "en un momento le atiende una
   persona". Vale la pena decidir si en `tema_clinico_sensible` conviene mandar la respuesta
   del agente **y** el aviso de escalamiento.
