// Fragmentos alrededor de cada aparición de la consulta (por palabras, sin tildes). Sirve para
// devolver solo la parte pertinente de un texto largo (secciones de WebCampus, PDFs del calendario).
export function fragmentos(texto: string, consulta: string, radio = 350): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(texto);
  const palabras = norm(consulta).split(/\s+/).filter((w) => w.length >= 3);
  if (!palabras.length) return [];
  const out: string[] = [];
  let desde = 0;
  while (out.length < 8) {
    const hits = palabras.map((w) => t.indexOf(w, desde)).filter((i) => i >= 0);
    if (!hits.length) break;
    const i = Math.min(...hits);
    const ini = Math.max(0, i - radio);
    const fin = Math.min(texto.length, i + radio);
    out.push((ini > 0 ? '…' : '') + texto.slice(ini, fin).trim() + (fin < texto.length ? '…' : ''));
    desde = fin;
  }
  return out;
}
