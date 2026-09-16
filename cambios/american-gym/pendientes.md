# American Gym — pendientes con el gimnasio

Estado al **2026-09-16**, después de cargar la información que pasó el gimnasio (entrenadores,
cronograma de clases, marcas, ubicación y horarios).

## 1. Precios reales — BLOQUEANTE para enseñar el demo afuera

Todos los precios que hay hoy en la pestaña `Servicios` **los inventé yo** a pedido del
usuario, para que el agente pueda cotizar mientras llegan los reales. Son plausibles para el
mercado costarricense y nada más que eso.

Lo que hay que pedirle al gimnasio:

- Membresía de American Gym: mensual, trimestral y anual.
- Matrícula o inscripción (pago único).
- Pase diario.
- Membresía de American Pilates y cuántas clases incluye.
- Membresía de American Jungle Box.
- Clase suelta de Pilates Reformer y de Jungle Box.
- Entrenamiento personal 1 a 1 y rutina personalizada.
- Si la valoración física inicial es realmente sin costo.
- Si las clases de American Experiences están de verdad incluidas en la membresía.

Se cambian en `scripts/american-gym/cargar-catalogo.mjs` y se publican con
`cd scripts/agenda && TENANT=american-gym node ../american-gym/cargar-catalogo.mjs --apply`.
**No editarlos a mano en Google:** la próxima corrida del script los pisa.

Convención de precios que ya entiende el agente:
- `precio_desde` = `precio_hasta` → precio fijo.
- `precio_hasta` vacío → es un mínimo, se dice "desde X".
- distintos → rango, se dice "entre X y Y".
- La unidad (POR MES, POR SESIÓN, POR CLASE, POR AÑO) va escrita en la `descripcion`, y el
  agente tiene instrucción de decirla siempre.

## 2. Reglamento y políticas — el hueco más grande después de los precios

No hay documento de RAG de políticas, así que hoy el agente **escala** ante cualquiera de
estas preguntas, que son de las más frecuentes:

- Requisitos de inscripción y qué papeles hay que llevar.
- Congelamiento de la membresía: si se puede, por cuánto tiempo, con qué aviso.
- Cancelación de la membresía y de una clase reservada; si hay cargo por no presentarse.
- Reembolsos.
- Formas de pago (efectivo, tarjeta, SINPE, deducción automática).
- Reglamento de uso: qué llevar, uso de máquinas, casilleros, invitados, menores de edad.

Cuando lleguen, van como un `reglamento.md` más en `cambios/american-gym/rag/`. A propósito
**no dejé un archivo vacío**: un documento de relleno en el RAG haría que el agente conteste
políticas inventadas, que es peor que escalar.

## 3. ~~"MACHO" en el cuadro de turnos~~ — RESUELTO

Confirmado por el usuario (2026-09-16): **MACHO es Luis Madrigal Molina** (`ENT-006`). Ya
estaba cargado así por descarte en `cargar-catalogo.mjs`; no hizo falta ningún cambio.

## 4. Horario de atención humana por WhatsApp

Cuando el agente escala, el mensaje cambia según si hay alguien para atender. Está puesto
**lunes a domingo de 7:00 a. m. a 8:00 p. m.**, que es una aproximación mía: el nodo solo
admite UNA ventana para toda la semana y el gimnasio abre en horarios distintos cada día.
Hay que preguntar a qué horas hay de verdad una persona contestando el WhatsApp.

Se cambia en `scripts/american-gym/clonar.mjs` (`CAMBIOS_CFG`).

## 4b. El número 7254-7861 en los correos de cita

El agente **sustituye** al WhatsApp 7254-7861: por eso tiene prohibido darle ese número al
cliente (ya está escribiendo ahí) y los documentos del RAG dicen "este mismo chat". Pero el
correo de confirmación de cita **sí** lo imprime en el pie, tomándolo de `Config.whatsapp`, y
ahí está bien: quien lee el correo está fuera de WhatsApp y necesita a dónde escribir.

Lo que hay que revisar antes del corte: hoy el demo corre en el **6419-1107**, no en el
7254-7861. Mientras eso siga así, el correo manda al cliente a un número que el bot no
contesta. Se arregla con el corte en Chatwoot, o cambiando `Config.whatsapp` en
`cargar-catalogo.mjs` mientras tanto.

## 5. ~~Calendarios de Google~~ — RESUELTO (2026-09-16)

Se creó un calendario por persona real (18, deduplicado por nombre; `ENT-009` queda sin
calendario a propósito porque está inactiva) y se llenó `Entrenadores!I` con
`scripts/american-gym/crear-calendarios.mjs`. Verificado de punta a punta con una reserva de
prueba: `agendar` crea el evento y `cancelar` lo borra. Detalle completo en la memoria del
proyecto (`project_american_gym.md`).

## 6. Cargo por cancelación tardía

En el motor (`preparar-gestion.js`) siguen los valores heredados de la clínica para
`CARGO` y `HORAS_AVISO`. Hay que poner los del gimnasio, o confirmar que no cobra nada por
cancelar tarde.

## 7. Datos de prueba en el Sheet (acumulados, no solo de la carga inicial)

Actualizado al 2026-09-16 — ya no son solo los tres de la carga inicial, se sumaron los que
dejaron las baterías de pruebas de esta etapa (motor, cupo, nombre real, voz, calendarios):

- `Clientes`: CLI-0001, CLI-0002 y CLI-0003 marcados "(ficticio)"; CLI-0004 "Juan Pablo
  Artavia Mora" (número real usado para probar el agente conversando, `+506 6018-1661`);
  CLI-0005 "Prueba QA Calendar" (número inventado, `+506 6000-0000`).
- `Citas`: CITA-0001 a CITA-0008. Todas menos CITA-0002 (Solicitada) y CITA-0003
  (Confirmada) quedaron `Cancelada` o `Completada` — no hay ninguna reserva activa colgando
  de una prueba.

El tester va a agregar más filas de estas mismas. Sirven para probar; conviene limpiar
`Clientes`, `Citas` y sus calendarios de Google asociados antes del demo real o de
entregárselo al cliente final.

## 8. Cosas de identidad que el gimnasio todavía no definió

- Colores de marca para los correos de cita (`MARCA` en el workflow de correos). El arte que
  pasaron es negro con verde lima.
- El perfil de WhatsApp del número del demo todavía muestra "Horarios ministros" y una
  descripción de la clínica dental. Está así por decisión del usuario; hay que cambiarlo
  antes del corte.
