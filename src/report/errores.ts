// Reporte de errores al proyecto, SOLO si la persona prendió el permiso `reportes.errores`.
// Qué se manda: versión del MCP, nombre de la tool, tipo de error, qué página de UADE cambió (si
// aplica), un detalle corto con números largos y mails tapados, sistema operativo y versión de Node.
// Qué NO se manda nunca: la pregunta, datos de la persona, contenido de páginas, cookies.
// Se manda a https://planuade.ar/api/mcp-error (único path permitido en ese host), a lo sumo una
// vez por día por cada error, y si falla no molesta: el reporte es lo menos importante.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, type Permission } from '../auth/permissions.js';
import { ConfirmationError } from '../auth/confirm.js';
import { PermissionError } from '../auth/permissions.js';
import { safeFetch } from '../net/http.js';
import { PolicyError } from '../net/policy.js';
import { SessionExpiredError } from '../net/session.js';
import { PageChangedError } from '../sources/webcampus/parse.js';
import { toolActual } from './contexto.js';

export const REPORT_URL = 'https://planuade.ar/api/mcp-error';
export const VERSION = '0.1.0';

export interface Reporte {
  version: string;
  tool: string;
  tipo: string;
  pagina: string | null;
  detalle: string;
  os: string;
  node: string;
}

// Errores esperables que no son bugs del MCP ni cambios de UADE: no se reportan.
const ESPERADOS = [SessionExpiredError, PermissionError, PolicyError, ConfirmationError];

// Tapa lo que podría identificar a alguien: mails, números largos (legajo, ids), rutas con usuario.
export function tapar(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<mail>')
    .replace(/\d{5,}/g, '<n>')
    .replace(/\/Users\/[^/\s]+|C:\\Users\\[^\\\s]+|\/home\/[^/\s]+/g, '<home>')
    .slice(0, 200);
}

export function armarReporte(err: Error, tool: string): Reporte {
  const pagina = err instanceof PageChangedError ? err.pagina : null;
  return {
    version: VERSION,
    tool,
    tipo: err.name || 'Error',
    pagina,
    // De un cambio de página alcanza con saber cuál; de otros errores, el mensaje tapado.
    detalle: pagina ? '' : tapar(err.message),
    os: process.platform,
    node: process.version,
  };
}

const clave = (r: Reporte) => `${r.tool}|${r.tipo}|${r.pagina ?? ''}|${r.detalle}`;

function yaReportadoHoy(r: Reporte, dir: string): boolean {
  const archivo = join(dir, 'reportes.json');
  let d: Record<string, string> = {};
  try { d = JSON.parse(readFileSync(archivo, 'utf8')); } catch { /* primera vez */ }
  const hoy = new Date().toISOString().slice(0, 10);
  if (d[clave(r)] === hoy) return true;
  for (const k of Object.keys(d)) if (d[k] !== hoy) delete d[k];
  d[clave(r)] = hoy;
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(archivo, JSON.stringify(d), { mode: 0o600 }); } catch { /* sin disco, se reporta igual */ }
  return false;
}

export async function reportarError(
  err: unknown,
  granted: ReadonlySet<Permission>,
  deps: { enviar?: (r: Reporte) => Promise<unknown>; dir?: string; tool?: string } = {},
): Promise<Reporte | null> {
  if (!granted.has('reportes.errores') || !(err instanceof Error)) return null;
  if (ESPERADOS.some((E) => err instanceof E)) return null;
  const r = armarReporte(err, deps.tool ?? toolActual.getStore() ?? 'desconocida');
  if (yaReportadoHoy(r, deps.dir ?? configDir())) return null;
  const enviar = deps.enviar ?? ((rep: Reporte) => safeFetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rep) }));
  try { await enviar(r); } catch { /* el reporte nunca rompe una respuesta */ }
  return r;
}
