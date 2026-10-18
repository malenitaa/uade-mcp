// Opens a PlanUADE URL in the student's default browser. Only planuade.ar, only https, and
// without a shell (execFile), so a crafted URL cannot run commands.
import { execFile } from 'node:child_process';
import { PLANUADE } from '../sources/planuade/link.js';

export function assertPlanUadeUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.origin !== PLANUADE || u.username || u.password) {
    throw new Error('Solo se pueden abrir links de https://planuade.ar');
  }
  return u;
}

export function openInBrowser(raw: string, exec: typeof execFile = execFile): Promise<void> {
  const url = assertPlanUadeUrl(raw).href;
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
