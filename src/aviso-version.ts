// Aviso de versión nueva: el MCP le pregunta al registro de npm cuál es la última versión publicada
// de uade-mcp y, si es más nueva que la instalada, lo dice en la primera respuesta del día. Solo
// avisa: nunca se actualiza ni corre ningún comando.
// Qué sale: un GET a REGISTRO_URL, sin cookies, sin cabeceras propias y sin ningún dato del
// estudiante ni de la instalación (la política de red lo exige, src/net/policy.ts). Como mucho una
// vez por día: la respuesta queda en la copia local cifrada. Si falla, tarda o trae algo inválido,
// no hay aviso y la tool responde como siempre.
// Se apaga con UADE_MCP_AVISO_VERSION=0 (apagado no sale ningún pedido). Ver docs/ACTUALIZAR.md.
import { z } from 'zod';
import { cache, TTL, type Cache } from './cache/cache.js';
import { safeFetch } from './net/http.js';
import { REGISTRO_URL } from './net/policy.js';
import { VERSION } from './report/errores.js';
import { untrusted } from './untrusted.js';

const TOPE_MS = 2000;
const TOPE_BYTES = 64 * 1024; // la respuesta real pesa unos 3 KB
export const MAX_NOTAS = 300;
const SEMVER = /^\d+\.\d+\.\d+$/;

// Lo único que se lee de la respuesta: la versión y el campo `notasDeVersion` del package.json
// publicado. Unas notas mal formadas se ignoran; una versión mal formada invalida todo.
const Respuesta = z.object({
  version: z.string().regex(SEMVER),
  notasDeVersion: z.object({ cambios: z.string(), seguridad: z.boolean() }).optional().catch(undefined),
});

export interface Ultima {
  version: string;
  cambios?: string;
  seguridad: boolean;
}

// Probado en docs/ACTUALIZAR.md (scripts/probar-npx.mjs): npx vuelve a preguntar por la última en
// cada arranque, así que no hay un comando aparte; una versión fijada solo cambia si la cambia la persona.
export const COMO_ACTUALIZAR =
  'Cómo se actualiza: cerrando y volviendo a abrir el cliente (con `npx -y uade-mcp`, npx baja la última al arrancar). ' +
  'Si la versión está fijada (`uade-mcp@x.y.z`), cambiando ese número en la configuración del cliente; si está instalado con `npm i -g`, con `npm i -g uade-mcp@latest`.';

// Por qué no se pregunta, o null si el chequeo está prendido. Sin copia local no hay dónde anotar
// que ya se preguntó hoy, así que tampoco se pregunta.
export function chequeoApagado(): string | null {
  if (process.env.UADE_MCP_AVISO_VERSION === '0') return 'UADE_MCP_AVISO_VERSION=0';
  if (process.env.UADE_MCP_CACHE === '0') return 'la copia local está apagada (UADE_MCP_CACHE=0)';
  return null;
}

export function esMasNueva(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! > y![i]!;
  return false;
}

async function preguntar(): Promise<Ultima | null> {
  try {
    const r = await safeFetch(REGISTRO_URL, { timeoutMs: TOPE_MS, maxBytes: TOPE_BYTES });
    if (r.status !== 200) return null;
    const d = Respuesta.parse(JSON.parse(r.text()));
    // Las notas son texto de afuera: una sola línea, sin caracteres de control y con tope.
    const cambios = d.notasDeVersion?.cambios.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_NOTAS);
    return { version: d.version, ...(cambios ? { cambios } : {}), seguridad: d.notasDeVersion?.seguridad === true };
  } catch {
    return null;
  }
}

// La última versión publicada, si es más nueva que la instalada; null si no lo es, si el chequeo
// está apagado o si no se pudo saber. El resultado (también el fallido) vale por un día.
export async function versionNueva(c: Cache = cache): Promise<Ultima | null> {
  if (chequeoApagado()) return null;
  try {
    const u = (await c.get('mcp:version', TTL.dia, preguntar)).value;
    return u && esMasNueva(u.version, VERSION) ? u : null;
  } catch {
    return null; // no se pudo escribir la copia local
  }
}

export function textoAviso(u: Ultima): string {
  const cabeza = u.seguridad
    ? `IMPORTANTE, decíselo al estudiante antes que nada: la versión de uade-mcp que tiene instalada (${VERSION}) tiene una falla de seguridad que la ${u.version} corrige. Recomendale actualizar ahora.`
    : `Aviso de uade-mcp, para contarle al estudiante al final de tu respuesta: hay una versión nueva, la ${u.version} (tiene instalada la ${VERSION}).`;
  const notas = u.cambios ? `\nQué cambia, según las notas de la versión:\n${untrusted(`notas de uade-mcp ${u.version}`, u.cambios)}` : '';
  return `${cabeza} ${COMO_ACTUALIZAR} El MCP no se actualiza solo y vos no corras nada para actualizarlo: lo decide y lo hace el estudiante.${notas}`;
}

// El aviso para esta respuesta, o null. Las llamadas pasan de a una: con varias tools a la vez se
// pregunta una sola vez y el aviso sale en una sola respuesta.
let cola: Promise<unknown> = Promise.resolve();
export function avisoDeVersion(c: Cache = cache): Promise<{ texto: string; primero: boolean } | null> {
  const turno = cola.then(async () => {
    const u = await versionNueva(c);
    if (!u) return null;
    try {
      let primeraDelDia = false;
      await c.get('mcp:version-avisada', TTL.dia, async () => (primeraDelDia = true));
      return primeraDelDia ? { texto: textoAviso(u), primero: u.seguridad } : null;
    } catch {
      return null;
    }
  });
  cola = turno;
  return turno;
}
