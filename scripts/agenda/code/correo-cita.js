// Arma el asunto y el HTML del correo de una cita. Tres tipos, un solo nodo: el cuerpo
// es el mismo salvo el encabezado, el bloque de la cita y la línea de cierre.
//
// NO lleva botones de Confirmar / Reagendar / Cancelar. Por decisión del proyecto la
// gestión vive ÚNICAMENTE en WhatsApp: el correo avisa, no actúa. Así no hace falta el
// token de gestión, ni un formulario público, ni mantener dos caminos que puedan
// contradecirse.
const e = $input.first().json;

const txt = (v) => (v === undefined || v === null ? '' : String(v)).trim();
// Todo lo que venga de la hoja o del paciente termina dentro del HTML del correo.
const esc = (v) => txt(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const tipo = txt(e.tipo);
const nombre = esc(e.nombre_paciente) || 'Paciente';
const servicio = esc(e.servicio);
const cita = esc(e.texto_cita);
const profesional = esc(e.profesional);
const anterior = esc(e.texto_anterior);
const nota = esc(e.nota);
const clinica = esc(e.sede_nombre) || 'Clínica Dental Dulce María';
const direccion = esc(e.sede_direccion);
const maps = txt(e.sede_link_maps);
const telefono = esc(e.sede_telefono);
const whatsapp = esc(e.sede_whatsapp) || telefono;

const PLANTILLAS = {
  nueva: {
    asunto: `Su cita quedó solicitada — ${txt(e.servicio)}`,
    titulo: 'Su cita quedó solicitada',
    entrada: `Recibimos su solicitud de cita para <strong>${servicio}</strong>. `
      + 'Aún no está confirmada: la clínica se la confirma por WhatsApp 24 horas antes.',
    color: '#0E6B5A',
    etiqueta: 'Solicitada',
  },
  reprogramada: {
    asunto: `Su cita cambió de fecha — ${txt(e.servicio)}`,
    titulo: 'Movimos su cita',
    entrada: `Su cita de <strong>${servicio}</strong> quedó reprogramada. `
      + 'La clínica se la confirma por WhatsApp 24 horas antes de la nueva fecha.',
    color: '#8A5A00',
    etiqueta: 'Reprogramada',
  },
  cancelada: {
    asunto: `Cancelamos su cita — ${txt(e.servicio)}`,
    titulo: 'Su cita quedó cancelada',
    entrada: `Cancelamos su cita de <strong>${servicio}</strong>, tal como nos pidió por WhatsApp.`,
    color: '#A62B1F',
    etiqueta: 'Cancelada',
  },
};

const p = PLANTILLAS[tipo];
if (!p) throw new Error(`tipo de correo desconocido: "${tipo}"`);

// El bloque de la cita. En una cancelación es la cita que se va, así que va tachada.
const filaDato = (etiqueta, valor) => (valor
  ? `<tr><td style="padding:6px 0;font-size:12px;color:#7C908A;width:38%;`
    + `text-transform:uppercase;letter-spacing:.06em;">${etiqueta}</td>`
    + `<td style="padding:6px 0;font-size:15px;color:#17322C;font-weight:600;">${valor}</td></tr>`
  : '');

const bloqueCita = `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:#E9F5F4;border:1px solid #A2D4CA;border-radius:8px;padding:18px 20px;">
    <tr><td>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${filaDato('Servicio', servicio)}
        ${filaDato(tipo === 'cancelada' ? 'Era el' : 'Fecha y hora', cita)}
        ${tipo === 'reprogramada' ? filaDato('Antes era', anterior) : ''}
        ${filaDato('Profesional', profesional)}
        ${filaDato('Estado', p.etiqueta)}
      </table>
    </td></tr>
  </table>`;

const bloqueNota = nota
  ? `<div style="margin:18px 0 0;padding:12px 16px;background:#FBF3E2;border-left:3px solid #8A5A00;
       border-radius:0 6px 6px 0;font-size:14px;color:#5A4A20;line-height:1.5;">${nota}</div>`
  : '';

// La gestión vive en WhatsApp, así que el correo empuja para allá en vez de dar botones.
const cierre = tipo === 'cancelada'
  ? 'Cuando quiera volver a agendar, escríbanos por WhatsApp y con gusto le buscamos un espacio.'
  : 'Si necesita confirmarla, moverla o cancelarla, escríbanos por WhatsApp. '
    + 'Recuerde que los cambios con menos de 24 horas de aviso generan un cargo de 10.000 colones.';

const bloqueSede = (direccion || telefono)
  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
            style="margin-top:22px;border-top:1px solid #D3E2DF;padding-top:16px;">
       <tr><td style="font-size:13px;color:#556963;line-height:1.6;">
         ${direccion ? `<strong style="color:#17322C;">${clinica}</strong><br>${direccion}<br>` : ''}
         ${maps ? `<a href="${esc(maps)}" style="color:#0E6B5A;">Ver en el mapa</a><br>` : ''}
         ${telefono ? `Tel. ${telefono}` : ''}${whatsapp && whatsapp !== telefono ? ` · WhatsApp ${whatsapp}` : ''}
       </td></tr>
     </table>`
  : '';

const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.asunto)}</title></head>
<body style="margin:0;padding:0;background:#F4F7F6;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#17322C;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:#F4F7F6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
             style="max-width:560px;background:#ffffff;border:1px solid #D3E2DF;
                    border-radius:12px;overflow:hidden;">
        <tr><td style="background:${p.color};padding:22px 28px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">${clinica}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:21px;line-height:1.25;color:#17322C;">${p.titulo}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#556963;">
            Hola ${nombre}, ${p.entrada}
          </p>
          ${bloqueCita}
          ${bloqueNota}
          <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#556963;">${cierre}</p>
          ${bloqueSede}
        </td></tr>
        <tr><td style="background:#E9F5F4;border-top:1px solid #A2D4CA;padding:16px 28px;
                       font-size:12px;color:#7C908A;line-height:1.5;">
          Este correo se generó automáticamente al gestionar su cita
          ${txt(e.id_cita) ? `(${esc(e.id_cita)})` : ''}. No hace falta responderlo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

return [{ json: { asunto: p.asunto, html, para: txt(e.email), tipo, id_cita: txt(e.id_cita) } }];
