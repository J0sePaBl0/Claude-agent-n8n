const v = ($input.first().json.valueRanges || [])[0] || {};
const filas = v.values || [];
const cab = (filas[0] || []).map((h) => String(h || '').trim());
const citas = filas.slice(1).map((f) => Object.fromEntries(cab.map((h, i) => [h, f[i] === undefined ? '' : f[i]])));
return [{ json: { citas } }];