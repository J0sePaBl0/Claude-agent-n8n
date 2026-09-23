# American Gym — pendientes

Estado al **2026-09-23**. El documento tiene dos partes: **A** es lo que necesitamos que el
gimnasio nos responda (para llevar a la reunión), y **B** es lo interno nuestro.

**Cómo se comporta hoy el agente ante lo que falta:** no inventa. Cuando no tiene el dato, lo
dice con naturalidad ("prefiero no darle un monto equivocado; déjeme averiguarlo") y avisa a una
persona del equipo. Por eso cada respuesta de la parte A se traduce en menos casos escalados.

---

# A. Lo que necesitamos del gimnasio

## A1. Membresías: qué incluye cada una — PRIORIDAD ALTA

Es la pregunta más probable de un cliente y hoy **escala**. Lo que ya está cargado, porque el
gimnasio lo indicó: las membresías del gimnasio incluyen el **uso regular del gimnasio** y la
**valoración física inicial** (sin costo adicional).

Falta confirmar:

- [ ] **¿Las membresías del gimnasio incluyen las clases de American Experiences** (Pilates
      Experience, Full Body, Yoga, Dance, Glúteos y Piernas, Virtual Cycling, Military, GAP)?
      ¿Todas las membresías o solo algunas?
- [ ] ¿Qué incluye cada **membresía del Box** (clases de WOD y HIIT, uso del gimnasio)?
- [ ] ¿Qué incluye el **Plan Nutricional** (₡55.997)? ¿Y el paquete **Box + Nutrición Semestral**?
- [ ] ¿La **valoración física** también se ofrece a quien no es miembro, y a qué costo?

## A2. Precios que faltan

Ya están cargados todos los de las tablas "Paquetes y tarifas" y "Paquetes BOX" (ver B1). Hoy
**no tienen precio**, y por eso el agente escala si preguntan:

- [ ] **Clase suelta de Pilates Reformer** (sin membresía).
- [ ] **Clase suelta de Jungle Box** (sin membresía).
- [ ] **Membresía de American Pilates:** ¿existe?, ¿cuánto cuesta?, ¿cuántas clases incluye?
      No aparece en las tarifas.
- [ ] **Clases de American Experiences sueltas** (para quien no tiene membresía del gimnasio),
      si se pueden pagar aparte.
- [ ] **Entrenamiento personal 1 a 1:** ¿se ofrece?, ¿a qué precio? Se quitó del catálogo
      porque no estaba en las tarifas.
- [ ] **Matrícula o inscripción:** ¿se cobra?, ¿cuánto? No aparece en las tarifas.
- [ ] **Rutina personalizada:** hoy figura a **₡9.000 por sesión**, valor que puse yo (el único
      inventado que se dejó a propósito). Confirmar o corregir.

## A3. Planes de las tablas que no quedaron claros

- [ ] **Plan B de Méritos (₡21.000):** ¿qué es y a quién aplica? **No está en el catálogo**, así
      que hoy el agente no sabe que existe.
- [ ] **Plan de Mediodía (₡25.000):** ¿de qué hora a qué hora? Y el **Plan D (₡23.000)**, que en
      la tabla dice "5 a. m. a 11 a. m. / Mediodía": ¿el mediodía es parte del plan o es otro?
- [ ] ¿Las tablas que pasaron están **completas**? La primera captura termina en Plan
      Nutricional y la segunda empieza en Plan Parejas: puede haber filas en medio.
- [ ] Confirmar que en los **planes +3, +4, +5** (y Box +3, Box Grupo +4) el número es la
      cantidad de personas y el precio es el **total del grupo**. Así están cargados.
- [ ] ¿El **Plan Estudiantil**, el **Adulto Mayor** (65+) y los planes grupales piden algún
      **comprobante o requisito**?

## A4. Políticas — el reglamento ya llegó; faltan los detalles comerciales

**Ya cargado (2026-09-23):** el documento "Políticas y Reglamento Interno American Gym" está en el
RAG como `rag/reglamento.md`. El agente ya contesta sin escalar: ingreso y membresía personal,
visitantes, menores (12 años o más; menores de 12 no pueden estar en planta, máquinas ni pesas),
uso de máquinas, comida, higiene, conducta, entrenadores personales, clases grupales, salud y
seguridad, fumar/vapear, objetos perdidos, fotos y videos, quejas.

Lo que el reglamento **no** trae y hoy se resuelve con "eso se gestiona en recepción" (o escala):

- [ ] **Congelamiento:** ¿se puede?, ¿por cuánto tiempo?, ¿con qué aviso? El reglamento solo
      dice que se gestiona en recepción.
- [ ] **Devoluciones y reembolsos:** ¿aplican?, ¿en qué casos?
- [ ] **Traslado** de una membresía a otra persona (el reglamento dice que es personal).
- [ ] **Formas de pago:** efectivo, tarjeta, SINPE, deducción automática. Esta es la única que
      hoy sí escala.
- [ ] **Requisitos de inscripción:** qué papeles o datos hay que llevar.
- [ ] **Cancelación** de la membresía y de una clase ya reservada; si hay cargo por no
      presentarse.
- [ ] **Menores de 12 a 17 años:** ¿qué autorización piden y de quién?, ¿hay membresía o
      precio distinto para ellos?
- [ ] **Entrenadores personales:** el reglamento dice que fijan sus tarifas con el cliente. ¿Hay
      una lista de entrenadores que ofrezcan 1 a 1 y un rango de precio que podamos informar?
- [ ] **Texto de la declaración de responsabilidad** que firma el usuario: hoy el agente solo
      dice que existe y que el texto se ve en recepción.

Notas de cómo quedó el agente: no interpreta cláusulas legales ni da juicios de salud; ante un
síntoma dice que pare y pida ayuda (9-1-1 si es urgente) y avisa a una persona del equipo.

## A5. Atención humana y cancelaciones

- [ ] **Horario en que una persona contesta el WhatsApp.** Hoy está puesto de **lunes a domingo,
      7:00 a. m. a 8:00 p. m.** (aproximación mía; el sistema admite una sola ventana para toda
      la semana y el gimnasio abre distinto cada día). Fuera de ese horario el agente dice que
      les escriben apenas abran.
- [ ] **Cargo por cancelación tardía** de una cita o clase: monto y con cuántas horas de aviso.
      Hoy quedan los valores heredados de la clínica; hay que poner los del gimnasio o confirmar
      que no cobran nada. (Está en `preparar-gestion.js`, `CARGO` y `HORAS_AVISO`.)

## A6. Identidad

- [ ] **Colores de marca** para los correos de confirmación de cita (`MARCA` en el workflow de
      correos). El arte que pasaron es negro con verde lima; falta confirmar los códigos.
- [ ] **Logo** en buena resolución, si quieren que salga en los correos.

---

# B. Lo interno nuestro

## B1. Qué ya está cargado (2026-09-23)

- **Precios reales** de las dos tablas, como `SRV-100` en adelante: 25 membresías/paquetes
  (gimnasio, Sesión de ₡5.000, Plan Nutricional y los 9 del Box). Las unidades (por mes, por
  semana, por trimestre, por año) van en la descripción y el agente las dice siempre.
- **Valoración física inicial:** incluida con las membresías del gimnasio, sin costo adicional.
- **Membresías del gimnasio:** incluyen el uso regular del gimnasio.
- **Regla vigente:** no queda nada inventado en el catálogo, salvo la Rutina personalizada. Todo
  lo demás que el gimnasio no especificó quedó **sin precio** (celda vacía) y sin afirmaciones
  de "incluido" o "gratis".
- Planes grupales: precio **total del grupo** (el número es la cantidad de personas).

Se editan en `scripts/american-gym/cargar-catalogo.mjs` y se publican con:

```
cd scripts/agenda
node proxy.mjs crear
TENANT=american-gym node ../american-gym/cargar-catalogo.mjs --apply
node proxy.mjs borrar
```

(El script escribe al Sheet por un workflow proxy temporal que se crea antes y se borra
después.) **No editar el Sheet a mano:** la próxima corrida del script lo pisa.

Convención de precios que entiende el agente: `precio_desde` = `precio_hasta` → fijo;
`precio_hasta` vacío → "desde X"; distintos → "entre X y Y"; ambos vacíos → no hay precio, el
agente averigua.

## B2. RAG (documentos del agente en Drive)

Carpeta "Agente - American Gym" (`1Iu6Zx-g1pX2N4g0_NKpXHPqs-2bUbwYS`). Los archivos fuente viven
en `cambios/american-gym/rag/`. El 2026-09-23 se corrigieron y subieron `clases.md` y
`equipo.md` (ya no afirman cosas que el gimnasio no confirmó), se creó `reglamento.md` (Drive id
`1cxaf-OpE3Y-hOhcq9H3RvnXa1amGX8wM`, sale del docx "Políticas y Reglamento Interno American Gym")
y se reindexó todo.

⚠️ La credencial de Drive del agente está **vencida** y sus triggers de Drive están
deshabilitados: **un cambio en Drive no se indexa solo**. Hay que lanzar "Reindexar todo
(manual)" en el workflow del agente. Reconectar la credencial requiere el navegador (OAuth).

## B3. Voz del agente al escalar

El mensaje que ve el cliente al escalar es la frase del agente más un aviso fijo ("Ya le aviso a
una persona del equipo para que le ayude; en unos minutos le escribe por aquí mismo."). Un
**filtro determinista** en el nodo `Determinar Mensaje por Horario` quita las frases que suenan
a sistema ("la información disponible…") o que anuncian el traspaso. Ese nodo y el aviso nuevo
están **solo en el workflow vivo**, no en `clonar.mjs`: si se vuelve a clonar el agente se pierden
(el código del filtro está en `scripts/american-gym/code/agente/filtro-voz-escalamiento.js`).

Punto flojo conocido: ante un plan que no existe ("plan B de méritos") a veces propone otro
("¿se refiere al Plan de Mediodía?") en vez de escalar directo. Se arregla solo cuando el plan
esté en el catálogo (A3).

## B4. Antes del corte al número real

- **Número en los correos de cita.** El agente sustituye al WhatsApp **7254-7861** (no se lo da
  al cliente porque ya está escribiendo ahí), pero el correo de confirmación sí imprime un
  número en el pie, tomado de `Config.whatsapp`. Hoy el demo corre en el **6419-1107**, no en el
  7254-7861: mientras siga así el correo manda al cliente a un número que el bot no contesta. Se
  arregla con el corte en Chatwoot, o cambiando `Config.whatsapp` en `cargar-catalogo.mjs`.
- **Perfil de WhatsApp del número del demo:** todavía muestra "Horarios ministros" y una
  descripción de la clínica dental. Está así por decisión del usuario; cambiarlo antes del corte.
- **Datos de prueba en el Sheet.** `Clientes`: CLI-0001 a 0003 marcados "(ficticio)", CLI-0004
  (Juan Pablo Artavia Mora, número real de pruebas, `+506 6018-1661`) y CLI-0005 "Prueba QA
  Calendar". `Citas`: CITA-0001 a 0008 y las que dejaron las pruebas de hoy. Limpiar `Clientes`,
  `Citas` y sus eventos en los calendarios de Google antes de entregárselo al gimnasio.

## B5. Resuelto

- ~~"MACHO" en el cuadro de turnos~~ → es **Luis Madrigal Molina** (`ENT-006`), confirmado
  2026-09-16.
- ~~Calendarios de Google~~ → 18 calendarios, uno por persona real (`ENT-009` sin calendario a
  propósito: está inactiva). Verificado de punta a punta con una reserva de prueba
  (2026-09-16). Detalle en la memoria del proyecto.
- ~~Precios inventados~~ → reemplazados por las tarifas reales (2026-09-23).
- ~~Valoración física: ¿tiene costo?~~ → incluida con la membresía (2026-09-23).
