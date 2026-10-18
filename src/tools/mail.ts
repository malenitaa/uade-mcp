// email_compose_draft: opens a pre-filled email in Outlook web. It never sends anything.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { openInBrowser } from '../net/open-browser.js';
import { buildDraftUrl } from '../sources/mail/draft.js';
import { run } from './common.js';

export function registerMailTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  open: (url: string) => Promise<void> = openInBrowser,
): void {
  server.registerTool(
    'email_compose_draft',
    {
      title: 'Prepare an email draft',
      description:
        "Opens Outlook web in the student's browser with a new email already filled in (to, cc, subject, body). " +
        'It does NOT send anything: the student reviews it and presses Send, or closes it. Only @uade.edu.ar ' +
        'recipients. To email a teacher, first get their address with webcampus_current_courses (idAula) and ' +
        'webcampus_teachers. Write the email in Spanish from Argentina, polite and brief, signed with the ' +
        "student's name only if you know it. Never tell the student the email was sent.",
      inputSchema: {
        to: z.array(z.string()).min(1).max(10).describe('recipient emails, @uade.edu.ar only'),
        cc: z.array(z.string()).max(10).optional(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(4000).describe('plain text; line breaks allowed'),
        open: z.boolean().default(true).describe('open the browser automatically (default true)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ to, cc, subject, body, open: abrir }) =>
      run(granted, 'webcampus.leer', async () => {
        const url = buildDraftUrl({ to, cc, subject, body });
        const abierto = abrir ? await open(url).then(() => true, () => false) : false;
        return abierto
          ? `Abrí el borrador en Outlook web, para ${to.join(', ')}. No se envió nada: revisalo y tocá Enviar si está bien.`
          : `No se envió nada. Abrí este link para ver el borrador en Outlook web: ${url}`;
      }),
  );
}
