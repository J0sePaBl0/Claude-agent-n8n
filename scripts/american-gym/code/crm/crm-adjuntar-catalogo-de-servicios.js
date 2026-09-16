// Arma el catálogo de servicios que se le pasa a la IA como contexto, y la lista blanca
// de id_servicio contra la que se valida después su respuesta.
const catalogo = $input.all().map(i => i.json).filter(r => r && r.id_servicio);

const esActivo = (v) => v === true || String(v).trim().toUpperCase() === 'TRUE';
const activos = catalogo.filter(s => esActivo(s.activo));
const usar = activos.length ? activos : catalogo; // si la columna 'activo' viniera vacía, no dejamos a la IA sin catálogo

const catalogo_servicios = usar.map(s => `${s.id_servicio}: ${s.nombre}`).join('\n');
const ids_validos = usar.map(s => String(s.id_servicio).trim());

const prev = $('CRM - Detectar oportunidad abierta').first().json;
return [{ json: { ...prev, catalogo_servicios, ids_validos } }];