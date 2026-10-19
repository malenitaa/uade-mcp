// uade_academic_calendar: UADE's official academic calendar and enrollment schedules (PDFs).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Calendario } from '../sources/calendario/index.js';
import { cache, TTL } from '../cache/cache.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { READ_ONLY, run } from './common.js';

export function registerCalendarioTools(server: McpServer, granted: ReadonlySet<Permission>, cal = new Calendario()): void {
  server.registerTool(
    'uade_academic_calendar',
    {
      title: 'UADE academic calendar',
      description: 'Official UADE calendar PDFs (live from WebCampus): topic calendario = term dates, midterm/make-up/final weeks per shift and campus, holidays; topic inscripciones = enrollment schedules. Text comes from table-like PDFs. For the student\'s own dates use webcampus_course_calendar.',
      inputSchema: {
        topic: z.enum(['calendario', 'inscripciones']).default('calendario'),
        filter: z.string().max(40).optional().describe('document name part: 3sedes, online, costa, feriados, previos…'),
      },
      annotations: READ_ONLY,
    },
    ({ topic, filter }) =>
      run(granted, 'webcampus.leer', async () => {
        const { value: docs, actualizado } = await cache.get(`calendario:${topic}`, TTL.semana, () => cal.documentos(topic));
        const f = filter?.toLowerCase().replace(/\s+/g, '');
        const elegidos = f ? docs.filter((d) => (d.nombre + d.url).toLowerCase().replace(/\s+|%20/g, '').includes(f)) : docs;
        return elegidos.length
          ? { actualizado, aviso: UNTRUSTED_NOTE, documentos: elegidos }
          : { aviso: `Ningún documento coincide con "${filter}".`, disponibles: docs.map((d) => d.nombre) };
      }),
  );
}
