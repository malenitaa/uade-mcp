// Opens a URL in the student's default browser. Only a short list of sites (Plan UADE and
// Outlook web), only https, and without a shell (execFile), so a crafted URL cannot run commands.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { ErrorDeUso } from '../error-de-uso.js';

export const OPENABLE_ORIGINS: ReadonlySet<string> = new Set(['https://planuade.ar', 'https://outlook.cloud.microsoft']);

export function assertOpenableUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !OPENABLE_ORIGINS.has(u.origin) || u.username || u.password) {
    throw new Error('Solo se pueden abrir links de https://planuade.ar o de Outlook web (https://outlook.cloud.microsoft).');
  }
  return u;
}

// Kept for the Plan UADE tool and its tests.
export function assertPlanUadeUrl(raw: string): URL {
  const u = assertOpenableUrl(raw);
  if (u.origin !== 'https://planuade.ar') throw new Error('Solo se pueden abrir links de https://planuade.ar');
  return u;
}

export function openInBrowser(raw: string, exec: typeof execFile = execFile): Promise<void> {
  const url = assertOpenableUrl(raw).href;
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  return new Promise((resolve, reject) => {
    exec(cmd, args, { timeout: 10_000 }, (err) => (err ? reject(new Error('No pude abrir el navegador.')) : resolve()));
  });
}

// Muestra archivos locales seleccionados en Finder (o abre su carpeta en otros sistemas), para
// arrastrarlos a un borrador. No sube ni lee el archivo. Solo archivos comunes dentro de tu
// carpeta personal y fuera de carpetas ocultas (.ssh, .config, …).
const CARPETAS_DOCUMENTOS = ['Desktop', 'Documents', 'Downloads', ['Library', 'Mobile Documents', 'com~apple~CloudDocs'].join(sep)];
export const EXTENSIONES_DOCUMENTO = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|md|pages|numbers|key|png|jpe?g|gif|heic|zip)$/i;

export function assertRevealablePath(raw: string, home = homedir()): string {
  const pedido = resolve(raw.replace(/^~(?=$|\/)/, home));
  if (!existsSync(pedido)) throw new ErrorDeUso(`No encontré el archivo: ${raw}`);
  // Se resuelven los atajos (symlinks): un atajo en Descargas no puede apuntar a ~/.ssh.
  const p = realpathSync(pedido);
  home = realpathSync(home);
  if (!p.startsWith(home + sep)) throw new ErrorDeUso(`Solo se pueden mostrar archivos de tu carpeta personal: ${raw}`);
  // Solo carpetas de documentos y tipos de documento: nunca ~/Library, perfiles de navegador, etc.
  const rel = p.slice(home.length + 1);
  if (!CARPETAS_DOCUMENTOS.some((c) => rel === c || rel.startsWith(c + sep))) {
    throw new ErrorDeUso(`Solo muestro archivos de Escritorio, Documentos, Descargas o iCloud Drive: ${raw}`);
  }
  if (!EXTENSIONES_DOCUMENTO.test(p)) throw new ErrorDeUso(`Ese tipo de archivo no se adjunta desde acá: ${raw}`);
  // Carpetas ocultas (.ssh, .config…) y, en Windows, AppData (perfiles de navegador, credenciales).
  if (p.slice(home.length).split(/[\\/]/).some((part) => part.startsWith('.') || /^appdata$/i.test(part))) {
    throw new ErrorDeUso(`No muestro archivos en carpetas ocultas o de sistema: ${raw}`);
  }
  if (!existsSync(p) || !statSync(p).isFile()) throw new ErrorDeUso(`No encontré el archivo: ${raw}`);
  return p;
}

export function revealInFileManager(raw: string, exec: typeof execFile = execFile): Promise<void> {
  const p = assertRevealablePath(raw);
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin' ? ['open', ['-R', p]] : process.platform === 'win32' ? ['explorer.exe', [`/select,${p}`]] : ['xdg-open', [dirname(p)]];
  return new Promise((ok, fail) => exec(cmd, args, { timeout: 10_000 }, (err) => (err && process.platform !== 'win32' ? fail(new Error('No pude mostrar el archivo.')) : ok())));
}

// Carpeta donde el MCP deja archivos que genera para la persona (la vista de la semana).
export function carpetaSalida(home = homedir()): string {
  return join(home, 'Downloads', 'uade-mcp');
}

// Abre con la app predeterminada un archivo .html o .ics que generó el MCP, solo de su carpeta de salida.
export function openGeneratedFile(raw: string, exec: typeof execFile = execFile): Promise<void> {
  const p = realpathSync(resolve(raw));
  const base = realpathSync(carpetaSalida());
  if (!p.startsWith(base + sep) || !/\.(html|ics)$/i.test(p)) throw new Error('Solo abro archivos que generó el MCP.');
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin' ? ['open', [p]] : process.platform === 'win32' ? ['explorer.exe', [p]] : ['xdg-open', [p]];
  return new Promise((ok, fail) => exec(cmd, args, { timeout: 10_000 }, (err) => (err && process.platform !== 'win32' ? fail(new Error('No pude abrir el archivo.')) : ok())));
}

// Guarda un archivo que bajó el MCP (un apunte de SharePoint) en su carpeta de salida, nunca en otro
// lado: nombre saneado (sin rutas, sin caracteres de control, sin empezar con punto), solo tipos de
// documento, sin pisar nada (si ya existe, agrega " (2)", " (3)"…) y solo legible por la persona.
export function nombreSeguro(nombre: string): string {
  const plano = basename(nombre.replace(/[\\/]/g, '_')).replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!plano || !EXTENSIONES_DOCUMENTO.test(plano)) throw new ErrorDeUso(`No guardo archivos de ese tipo (${nombre || 'sin nombre'}): solo documentos, planillas, presentaciones, imágenes o zip.`);
  const ext = extname(plano);
  const base = plano.slice(0, plano.length - ext.length).slice(0, 100);
  return base + ext;
}

export async function guardarEnSalida(nombre: string, bytes: Uint8Array, home = homedir()): Promise<string> {
  const dir = carpetaSalida(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const seguro = nombreSeguro(nombre);
  const ext = extname(seguro);
  const base = seguro.slice(0, seguro.length - ext.length);
  for (let i = 1; i <= 50; i++) {
    const ruta = join(dir, i === 1 ? seguro : `${base} (${i})${ext}`);
    try {
      const fh = await open(ruta, 'wx', 0o600); // wx: falla si existe, nunca pisa
      try { await fh.writeFile(bytes); } finally { await fh.close(); }
      return ruta;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('Ya hay demasiadas copias de ese archivo en Downloads/uade-mcp.');
}
