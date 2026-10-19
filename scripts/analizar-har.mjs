// Lee un HAR (registro de red del navegador) y resume SOLO la estructura de las peticiones a UADE:
// método, host+ruta, nombres de parámetros y valores no sensibles. Tapa cookies, tokens, sesiones,
// Authorization, Set-Cookie y campos enormes (VIEWSTATE). Sirve para mapear el flujo de PIA a partir
// de una inscripción real hecha por la persona, sin que ninguna automatización toque el sistema.
//
// Uso: node scripts/analizar-har.mjs capturas/inscripcion.har
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/analizar-har.mjs <archivo.har>'); process.exit(1); }
const har = JSON.parse(readFileSync(file, 'utf8'));
const entries = har.log?.entries ?? [];

const HOSTS = /(uade\.edu\.ar|login\.microsoftonline\.com)$/i;
const SENSIBLE = /(cookie|token|auth|sess|secret|password|pwd|clave|__VIEWSTATE|__EVENTVALIDATION|param\b|code|id_token|nonce|state)/i;
const RUIDO = /\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)/i;

const tapar = (nombre, valor) => {
  if (SENSIBLE.test(nombre)) return `<tapado:${String(valor ?? '').length} chars>`;
  const v = String(valor ?? '');
  return v.length > 80 ? v.slice(0, 80) + `…(+${v.length - 80})` : v;
};

let n = 0;
for (const e of entries) {
  const { request: rq, response: rs } = e;
  let u; try { u = new URL(rq.url); } catch { continue; }
  if (!HOSTS.test(u.hostname) || RUIDO.test(u.pathname)) continue;
  n++;
  console.log(`\n#${n} ${rq.method} ${u.hostname}${u.pathname}  → ${rs.status}${rs.redirectURL ? '  ⇒ ' + rs.redirectURL.replace(/[?#].*/, '') : ''}`);
  if (u.search) console.log('   query:', [...u.searchParams].map(([k, v]) => `${k}=${tapar(k, v)}`).join('  '));
  const ct = rs.content?.mimeType ?? '';
  if (ct && !/html|javascript/.test(ct)) console.log('   tipo respuesta:', ct);
  const pd = rq.postData;
  if (pd) {
    if (pd.params?.length) {
      console.log(`   POST (${pd.mimeType}) campos:`);
      for (const p of pd.params) console.log(`     ${p.name} = ${tapar(p.name, p.value)}`);
    } else if (pd.text) {
      let txt = pd.text;
      try { const j = JSON.parse(txt); txt = JSON.stringify(Object.fromEntries(Object.entries(j).map(([k, v]) => [k, tapar(k, typeof v === 'object' ? JSON.stringify(v) : v)]))); } catch { txt = txt.length > 200 ? txt.slice(0, 200) + '…' : txt; }
      console.log(`   POST (${pd.mimeType}):`, txt);
    }
  }
}
console.log(`\n${n} peticiones a UADE/Microsoft (de ${entries.length} totales). Cookies, tokens y VIEWSTATE tapados.`);
