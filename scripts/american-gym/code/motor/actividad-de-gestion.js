// Una fila en Actividades por cada gestión, con los enums que ya viven en Config.
const prep = $('Preparar gestión').first().json;
const loc = $('Localizar cita').first().json;
const datos = $('Preparar datos').first().json;

const ids = datos.actividades
  .map((a) => parseInt(String(a.id_actividad || '').replace(/\D/g, ''), 10))
  .filter((n) => !Number.isNaN(n));

return [{
  json: {
    id_actividad: 'ACT-' + String((ids.length ? Math.max(...ids) : 0) + 1).padStart(5, '0'),
    fecha_hora: DateTime.now().setZone('America/Costa_Rica').toFormat('yyyy-MM-dd HH:mm'),
    id_cliente: loc.cita.id_cliente,
    id_oportunidad: loc.cita.id_oportunidad || '',
    id_cita: loc.cita.id_cita,
    // si vino con token, el cliente entró por el enlace del correo, no por WhatsApp
    canal: String($('Normalizar entrada').first().json.token || '').trim() ? 'Email' : 'WhatsApp',
    tipo: prep.actividad.tipo,
    direccion: 'Entrante',
    resumen: prep.actividad.resumen,
    intencion: prep.actividad.intencion,
    sentimiento: 'Neutro',
    generado_por: 'Bot',
    requiere_seguimiento: 'FALSE',
    url_documento: '',
  },
}];