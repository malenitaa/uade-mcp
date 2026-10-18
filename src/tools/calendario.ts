// uade_academic_calendar: UADE's official academic calendar and enrollment schedules (PDFs).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Calendario } from '../sources/calendario/index.js';
import { READ_ONLY, run } from './common.js';

export function registerCalendarioTools(server: McpServer, granted: ReadonlySet<Permission>, cal = new Calendario()): void {
  server.registerTool(
    'uade_academic_calendar',
    {
      title: 'UADE academic calendar',
      description:
        "UADE's official calendar PDFs, found live from the WebCampus menu (they change every term). " +
        'topic "calendario": start and end of each term, weeks of 1st and 2nd midterms, make-ups and finals per ' +
        'weekday and shift (morning/afternoon vs night), exam periods and holidays, per campus (Buenos Aires 3 sedes, ' +
        'Costa Argentina, UBS, Online). topic "inscripciones": enrollment schedules (general info, MRI and summer, ' +
        'summer courses, final exams, free exams). The text comes from PDFs laid out as tables, so read it carefully ' +
        'and say which document a date comes from. For the student\'s own course dates prefer webcampus_course_calendar. Read-only.',
      inputSchema: {
        topic: z.enum(['calendario', 'inscripciones']).default('calendario'),
        filter: z.string().max(40).optional().describe('keep only documents whose name contains this, e.g. "3sedes", "online", "feriados", "previos"'),
      },
      annotations: READ_ONLY,
    },
    ({ topic, filter }) =>
      run(granted, 'webcampus.leer', async () => {
        const docs = await cal.documentos(topic);
        const f = filter?.toLowerCase().replace(/\s+/g, '');
        const elegidos = f ? docs.filter((d) => (d.nombre + d.url).toLowerCase().replace(/\s+|%20/g, '').includes(f)) : docs;
        return elegidos.length ? elegidos : { aviso: `Ningún documento coincide con "${filter}".`, disponibles: docs.map((d) => d.nombre) };
      }),
  );
}
