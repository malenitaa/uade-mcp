// email_compose_draft: opens a pre-filled email in Outlook web. It never sends anything.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { assertRevealablePath, openInBrowser, revealInFileManager } from '../net/open-browser.js';
import { buildDraftUrl } from '../sources/mail/draft.js';
import { cache, TTL } from '../cache/cache.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { run } from './common.js';

export function registerMailTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  open: (url: string) => Promise<void> = openInBrowser,
  reveal: (path: string) => Promise<void> = revealInFileManager,
  wc = new WebCampus(),
): void {
  // Mails de los equipos docentes de tus materias: cualquier otro destinatario se marca para revisar.
  async function docentesDeMisMaterias(): Promise<Set<string>> {
    try {
      const { value } = await cache.get('docentes-mis-materias', TTL.dia, async () => {
        const { aulas } = await wc.cursada();
        const listas = await Promise.all(aulas.map((a) => wc.docentes(a.idAula).catch(() => [])));
        return listas.flat().map((d) => d.email?.toLowerCase()).filter((e): e is string => !!e);
      });
      return new Set(value);
    } catch {
      return new Set();
    }
  }
  server.registerTool(
    'email_compose_draft',
    {
      title: 'Prepare an email draft',
      description: 'Opens a pre-filled email in Outlook web for the student to review and send. Never sends. Only @uade.edu.ar recipients (get teachers with webcampus_teachers). Files cannot be attached automatically: pass local paths in attachments and they are shown selected in Finder to drag into the draft.',
      inputSchema: {
        to: z.array(z.string()).min(1).max(10),
        cc: z.array(z.string()).max(10).optional(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(4000),
        attachments: z.array(z.string()).max(10).optional(),
        open: z.boolean().default(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ to, cc, subject, body, attachments, open: abrir }) =>
      run(granted, 'webcampus.leer', async () => {
        const url = buildDraftUrl({ to, cc, subject, body });
        const archivos = (attachments ?? []).map((a) => assertRevealablePath(a)); // valida antes de abrir nada
        const docentes = await docentesDeMisMaterias();
        const ajenos = [...to, ...(cc ?? [])].map((e) => e.toLowerCase()).filter((e) => !docentes.has(e));
        const abierto = abrir ? await open(url).then(() => true, () => false) : false;
        const mostrados: string[] = [];
        if (abrir) for (const f of archivos) if (await reveal(f).then(() => true, () => false)) mostrados.push(f.split('/').pop()!);
        return [
          abierto
            ? `Abrí el borrador en Outlook web, para ${to.join(', ')}. No se envió nada: revisalo y tocá Enviar si está bien.`
            : `No se envió nada. Abrí este link para ver el borrador en Outlook web: ${url}`,
          mostrados.length ? `Te dejé seleccionado en Finder: ${mostrados.join(', ')}. Arrastralo al borrador para adjuntarlo.` : '',
          ajenos.length ? `Atención: ${ajenos.join(', ')} no es del equipo docente de tus materias. Revisá que sea a quien querés escribirle antes de enviar.` : '',
        ].filter(Boolean).join('\n');
      }),
  );
}
