// Opens a URL in the student's default browser. Only a short list of sites (Plan UADE and
// Outlook web), only https, and without a shell (execFile), so a crafted URL cannot run commands.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';

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
export function assertRevealablePath(raw: string, home = homedir()): string {
  const p = resolve(raw.replace(/^~(?=$|\/)/, home));
  if (!p.startsWith(home + sep)) throw new Error(`Solo se pueden mostrar archivos de tu carpeta personal: ${raw}`);
  if (p.slice(home.length).split(sep).some((part) => part.startsWith('.'))) throw new Error(`No muestro archivos en carpetas ocultas: ${raw}`);
  if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`No encontré el archivo: ${raw}`);
  return p;
}

export function revealInFileManager(raw: string, exec: typeof execFile = execFile): Promise<void> {
  const p = assertRevealablePath(raw);
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin' ? ['open', ['-R', p]] : process.platform === 'win32' ? ['explorer.exe', [`/select,${p}`]] : ['xdg-open', [dirname(p)]];
  return new Promise((ok, fail) => exec(cmd, args, { timeout: 10_000 }, (err) => (err && process.platform !== 'win32' ? fail(new Error('No pude mostrar el archivo.')) : ok())));
}
