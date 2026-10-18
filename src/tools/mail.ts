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
      description: 'Opens a pre-filled email in Outlook web for the student to review and send. Never sends. Only @uade.edu.ar recipients (get teachers with webcampus_teachers).',
      inputSchema: {
        to: z.array(z.string()).min(1).max(10),
        cc: z.array(z.string()).max(10).optional(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(4000),
        open: z.boolean().default(true),
      },
      annotations: { readOnlyHint: true },
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
