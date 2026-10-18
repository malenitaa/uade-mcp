// Opens a URL in the student's default browser. Only a short list of sites (Plan UADE and
// Outlook web), only https, and without a shell (execFile), so a crafted URL cannot run commands.
import { execFile } from 'node:child_process';

export const OPENABLE_ORIGINS: ReadonlySet<string> = new Set(['https://planuade.ar', 'https://outlook.office.com']);

export function assertOpenableUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !OPENABLE_ORIGINS.has(u.origin) || u.username || u.password) {
    throw new Error('Solo se pueden abrir links de https://planuade.ar o de Outlook web (https://outlook.office.com).');
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
