## Agenda — disponibilidad y citas

Motor de agenda de la Clínica Dulce María. Lo llama el agente `Agente conversión y agenda`
(`GmGt3g3krJCoDli0`) a través de dos herramientas `toolWorkflow`: `consultar_disponibilidad`
y `agendar_cita`.

**Entradas** (`accion`, `id_servicio`, `fecha_texto`, `telefono`, `nombre_paciente`).
`fecha_texto` son **las palabras del paciente sin traducir** ("el martes en la tarde").
No hay campo de fecha ya resuelta a propósito: si existiera, el modelo la llenaría con su
propia aritmética y habría dos fuentes para el mismo dato. Quien resuelve la fecha es el
Code node `Interpretar la fecha`, anclado en la hora real de Costa Rica.

**Fuente de verdad:** el Sheet `CRM - demo`, tabs `Citas` y `Profesionales`.

### Reglas implementadas (DM_01 y DM_03)

- Domingos y feriados cerrado (tab `Feriados`).
- El último espacio de cada día termina **una hora antes del cierre** de la sede.
- Nada de más de 90 minutos después de las 4:00 p. m. entre semana, ni de las 11:00 los sábados.
- 2 espacios diarios reservados para urgencias (10:00 y 15:00, en PROF-01).
- Todo paciente nuevo pasa primero por una **valoración inicial**. Se valida solo al
  agendar, no al consultar: consultar informa, agendar bloquea.
- Un paciente no puede tener dos citas de tratamiento el mismo día.
- Las citas nacen con `estado = Solicitada`; la clínica confirma 24 h antes.

Las reglas de **día por especialidad** (endodoncia martes y jueves, ortodoncia L/X/V por la
mañana, implantes miércoles tarde o sábados) **no están codificadas**: salen solas del cruce
`Servicios.profesionales_habilitados` × `Profesionales.dias_atencion`. Para cambiarlas se
edita el Sheet, no este workflow.

### Malla de espacios

Los inicios se generan **cada `duracion_min`**, anclados al arranque de la ventana del
profesional: una limpieza de 45 min da 08:00, 08:45, 09:30…; una valoración de 30 da 08:00,
08:30… La agenda se ve distinta según el servicio. Si el día que pidió el paciente queda
vacío, hay una segunda pasada con malla de 15 min para no decir "no hay" cuando sí hay.

### Contrato de salida

La herramienta **nunca devuelve vacío ni un "no hay" pelado** — un resultado vacío es lo que
hace alucinar al modelo. Siempre salen `mensaje` redactado y `alternativas`. Cuando una regla
bloquea, `motivo` es un valor fijo: `servicio_no_disponible`, `requiere_valoracion_previa`,
`dia_no_habilitado`, `ambiguo`, `no_coincide`, `dos_citas_mismo_dia`, `fuera_de_horario`.

### Limitaciones conocidas

- **Google Sheets no da atomicidad.** El nodo `Confirmar y preparar` re-verifica que el
  espacio siga libre justo antes de escribir. Alcanza para un demo con un probador; no para
  producción real.
- **`Crear evento en Calendar` está deshabilitado.** Falta crear los 4 calendarios, pegar sus
  ids en `Profesionales.id_calendar` y crear la credencial `googleCalendarOAuth2Api` — la que
  existe (`trignia automations account`) es de Sheets y no tiene el scope de Calendar.
- **`Webhook de prueba` (`/agenda-test`) es solo para probar el motor aislado**, sin pasar por
  WhatsApp. Deshabilitalo antes de dar el demo.
- La Dra. Vargas atiende "sábados alternos" según DM_01; acá figura todos los sábados porque
  el modelo de datos no lo expresa.
