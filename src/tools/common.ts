// Shared helpers for tools: permission check, error handling and Argentine date format.
import { requirePermission, type Permission } from '../auth/permissions.js';
import { PageChangedError } from '../sources/webcampus/parse.js';
import { reportarError } from '../report/errores.js';
import { untrusted } from '../untrusted.js';

// Only readOnlyHint: the other annotations would repeat defaults and cost tokens on every message.
export const READ_ONLY = { readOnlyHint: true } as const;

export type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export type ToolResult = { content: ToolContent[]; isError?: boolean };

// Una tool puede devolver, además del JSON, imágenes para que el modelo las mire (cronograma de
// inscripción, PDFs escaneados): van como contenido de imagen del MCP, después del texto.
export interface Imagen {
  mimeType: string;
  base64: string;
}
export const CON_IMAGENES = 'imagenes';


const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/;

// UADE is an Argentine university: every date shown to the user is dd/mm/aaaa (24 h times).
// Parsers keep ISO internally so dates can be compared; this converts them on the way out.
export function toArgentineDates<T>(value: T): T {
  if (typeof value === 'string') {
    const m = value.match(ISO);
    return (m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ''}` : value) as T;
  }
  if (Array.isArray(value)) return value.map(toArgentineDates) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toArgentineDates(v)])) as T;
  }
  return value;
}

// Drops null, undefined, empty strings, empty arrays and empty objects: the agent pays for every
// character of a tool result, and an absent field says the same as an empty one.
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact).filter((v) => !isEmpty(v)) as T;
  if (value && typeof value === 'object') {
    const out = Object.entries(value)
      .map(([k, v]) => [k, compact(v)] as const)
      .filter(([, v]) => !isEmpty(v));
    return Object.fromEntries(out) as T;
  }
  return value;
}
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
}

export async function run(
  granted: ReadonlySet<Permission>,
  permission: Permission,
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  try {
    requirePermission(granted, permission);
    const resultado = await fn();
    const imagenes = sacarImagenes(resultado);
    const data = compact(toArgentineDates(resultado));
    const content: ToolContent[] = [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }];
    for (const i of imagenes) content.push({ type: 'image', data: i.base64, mimeType: i.mimeType });
    return { content };
  } catch (err) {
    // Modo degradado: si UADE cambió una página, se devuelve igual su texto plano, marcado como
    // sin estructura, para que el agente pueda responder mientras se actualiza el parser.
    if (err instanceof PageChangedError && err.texto) {
      void reportarError(err, granted);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          aviso: `${err.message} Mientras tanto, abajo va el texto de la página sin procesar: leelo con cuidado y decile al estudiante que la respuesta puede estar incompleta.`,
          modoDegradado: true,
          pagina: err.pagina,
          textoSinEstructura: untrusted(err.pagina, err.texto),
        }) }],
      };
    }
    // Si la persona activó los reportes, se avisa al proyecto (sin datos); nunca frena la respuesta.
    void reportarError(err, granted);
    // Error messages are already in Spanish: they are meant to be relayed to the student as is.
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}

// Saca (y devuelve) las imágenes de un resultado, para mandarlas como contenido aparte.
function sacarImagenes(resultado: unknown): Imagen[] {
  if (!resultado || typeof resultado !== 'object' || Array.isArray(resultado)) return [];
  const r = resultado as Record<string, unknown>;
  const xs = r[CON_IMAGENES];
  if (!Array.isArray(xs)) return [];
  delete r[CON_IMAGENES];
  return xs.filter((i): i is Imagen => !!i && typeof i === 'object' && typeof (i as Imagen).base64 === 'string' && typeof (i as Imagen).mimeType === 'string');
}
