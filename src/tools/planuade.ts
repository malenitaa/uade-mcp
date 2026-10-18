// planuade_import_transcript: reads the WebCampus transcript and opens Plan UADE with it.
// Nothing is written here: Plan UADE writes to the student's browser only after they accept
// its confirmation dialog, so the read permission is enough.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { openInBrowser } from '../net/open-browser.js';
import { buildImportLink } from '../sources/planuade/link.js';
import { FACULTADES } from '../sources/planuade/planes.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { run } from './common.js';

export function registerPlanUadeTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  open: (url: string) => Promise<void> = openInBrowser,
): void {
  server.registerTool(
    'planuade_import_transcript',
    {
      title: 'Load the transcript into Plan UADE',
      description:
        "Reads the student's transcript from WebCampus and opens planuade.ar in their default browser with it " +
        '(passed subjects with grade, pending finals and current courses). Plan UADE only applies what changed, and ' +
        'only after the student accepts its confirmation dialog. The data travels in the URL fragment, never to a server. ' +
        'Set open=false to just get the link.',
      inputSchema: {
        plan: z.string().regex(/^\d+$/).optional().describe('plan code, only if the student has more than one degree'),
        faculty: z.enum(FACULTADES).optional().describe('only if the tool asks for it because it does not know the plan'),
        open: z.boolean().default(true).describe('open the browser automatically (default true)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ plan, faculty, open: abrir }) =>
      run(granted, 'webcampus.leer', async () => {
        const h = await wc.historial(plan);
        const link = buildImportLink(h, faculty);
        const r = link.resumen;
        let abierto = false;
        if (abrir) abierto = await open(link.url).then(() => true, () => false);
        return [
          `Carrera: ${h.carrera} (plan ${h.plan}) → planuade.ar/${link.facultad}`,
          `Incluye: ${r.aprobadas} aprobadas (${r.conNota} con nota), ${r.finalesPendientes} con final pendiente, ${r.cursando} cursando.`,
          abierto
            ? 'Se abrió Plan UADE en tu navegador: revisá lo que va a cambiar y tocá Aceptar.'
            : `Abrí este link en tu navegador (Plan UADE te muestra qué cambia y pide confirmación): ${link.url}`,
        ].join('\n');
      }),
  );
}
