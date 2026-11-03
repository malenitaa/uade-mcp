// Node 22 o más nuevo: el bundle de pdf.js que trae unpdf 1.9 usa `Iterator` (Node 22+), así que en
// Node 20 ningún PDF se puede leer y además Node 20 terminó su soporte en abril de 2026. Se chequea
// antes de cargar nada: este módulo es el primer import del entrypoint.
export const NODE_MINIMO = 22;

// Mensaje de error si `version` (process.versions.node) es más vieja que la mínima; null si sirve.
export function errorDeNode(version: string): string | null {
  const mayor = Number(version.split('.')[0]);
  if (Number.isFinite(mayor) && mayor >= NODE_MINIMO) return null;
  return `uade-mcp necesita Node.js ${NODE_MINIMO} o más nuevo; tenés ${version}. Bajalo de nodejs.org.`;
}

const error = errorDeNode(process.versions.node);
if (error) {
  console.error(error);
  process.exit(1);
}
