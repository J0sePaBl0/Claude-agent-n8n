## American Gym — Agenda (disponibilidad y citas)

Motor de agenda del demo de American Gym. Lo llama el agente `American Gym — Agente WhatsApp`
con cinco herramientas `toolWorkflow`: `consultar_disponibilidad`, `agendar_cita`,
`confirmar_cita`, `cancelar_cita` y `reagendar_cita`.

Es un clon del motor de la Clínica Dental Dulce María (archivado: ver `archivo/dulce-maria/`). El
código versionado vive en `scripts/american-gym/code/motor/`; se publica con
`node scripts/american-gym/clonar.mjs motor`. **No editar acá a mano**: el próximo clonado lo pisa.

**Entradas** (`accion`, `id_servicio`, `fecha_texto`, `telefono`, `nombre_cliente`,
`nombre_dictado`, `email`). `fecha_texto` son **las palabras del cliente sin traducir** ("el
martes en la tarde"). Quien resuelve la fecha es `Interpretar la fecha`, anclado en la hora real
de Costa Rica.

**Los dos nombres.** `nombre_cliente` es el del perfil de WhatsApp (poco confiable: apodos,
negocios, teléfonos prestados) y `nombre_dictado` es el que el cliente le dicta al agente. La
ficha de `Clientes` se escribe con el **dictado > el que ya estaba en la hoja > el de WhatsApp**
(`Validar reglas`), y la salida devuelve `nombre_registrado` y `email_registrado` para que el
agente trate a la persona por su nombre real y no le vuelva a pedir datos que ya dio.

**Fuente de verdad:** el Sheet `CRM - American Gym`, pestañas `Servicios`, `Entrenadores`,
`Citas`, `Feriados`, `Config`, `Clientes`, `Oportunidades` y `Actividades`, leídas con **un solo
`values:batchGet`** (Google permite 60 lecturas por minuto).

### Reglas

- Feriados cerrado (pestaña `Feriados`). Los días y horas de la sede salen de
  `Config.horario_atencion` ("Lun-Vie 05:00-22:00, Sáb 07:00-14:00, Dom 08:00-12:00"): un día
  que no aparece está cerrado.
- El último espacio de cada día termina **una hora antes del cierre**.
- Qué días atiende cada servicio sale del cruce `Servicios.entrenadores_habilitados` ×
  `Entrenadores.dias_atencion`. Para cambiarlo se edita el Sheet, no este workflow.
- Ocupan espacio las citas `Solicitada`, `Confirmada` y `Reprogramada`.
- **Cupo (`Servicios.cupo`)**: cuántas personas caben en el MISMO espacio. Vacío o 1 es la cita
  1 a 1 de siempre (la primera reserva cierra el espacio); mayor que 1 es una clase grupal y el
  espacio se cierra recién al llenarse. Solo se le pone cupo > 1 a un servicio cuyos
  `entrenadores_habilitados` son filas `CLS-*`, dedicadas a esa clase: si colgara de un
  entrenador de planta, las inscripciones le taparían su agenda 1 a 1.
- Nadie puede inscribirse dos veces a la misma clase (`motivo: "ya_inscrito"`), porque gastaría
  dos campos de los que quedan.
- **Los teléfonos se guardan como `(+506) 8888-9999`, nunca con `+` adelante**: Google Sheets
  trata un valor que empieza con `+` como fórmula y lo guardaba como `#ERROR!`. Con el teléfono
  roto el cliente no se volvía a encontrar nunca: ficha nueva en cada reserva y sus citas
  invisibles para confirmar o cancelar.
- Las citas nacen `Solicitada`; el gimnasio confirma 24 h antes.
- **Sin reglas por tipo de cita** (`REGLAS_POR_TIPO = false`): cualquier cliente agenda
  cualquier servicio. El camino de la valoración previa de Dulce María sigue escrito y apagado.
- "A las 6" sin a. m./p. m.: si la sede abre en los dos horarios, viajan las dos horas y el
  motor pregunta en vez de adivinar.

### Malla de espacios

Los inicios se generan cada `duracion_min` del servicio, anclados al arranque de la ventana
del entrenador. Si el día pedido queda vacío, segunda pasada con malla de 15 min.

### Contrato de salida

Nunca vacío ni un "no hay" pelado: siempre `mensaje` redactado y `alternativas`. Valores fijos de
`motivo`: `servicio_no_disponible`, `feriado`, `cerrado`, `dia_no_habilitado`, `dia_lleno`,
`ambiguo`, `no_coincide`, `fuera_de_horario`, `sin_citas`, `token_invalido`, `cita_no_activa`,
`ya_inscrito`. Además de los horarios, la salida lleva `es_clase_grupal`, `nombre_registrado` y
`email_registrado`.

### Limitaciones conocidas

- **Google Sheets no da atomicidad.** `Confirmar y preparar` re-verifica que el espacio siga
  libre justo antes de escribir. Alcanza para un demo, no para producción.
- `Escribir cita` no tiene reintentos a propósito: `values:append` no es idempotente.
- **`Webhook de prueba` (`/agenda-test-american-gym`)** es para probar el motor aislado.
  Deshabilitalo antes de dar el demo: no tiene autenticación.
