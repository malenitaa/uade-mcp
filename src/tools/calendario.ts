// uade_academic_calendar: UADE's official academic calendar and enrollment schedules (PDFs).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Calendario } from '../sources/calendario/index.js';
import { cache, TTL } from '../cache/cache.js';
import { fragmentos } from '../sources/docs/fragmentos.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run } from './common.js';

export function registerCalendarioTools(server: McpServer, granted: ReadonlySet<Permission>, cal = new Calendario()): void {
  server.registerTool(
    'uade_academic_calendar',
    {
      title: 'UADE academic calendar',
      description: 'Official UADE calendar PDFs (live from WebCampus): topic calendario = term dates, midterm/make-up/final weeks per shift and campus, holidays; topic inscripciones = enrollment schedules (MRI, summer courses, previos, libres) and the summer class lists per campus (subject, code, shift, dates). For inscripciones do not read everything (14 PDFs, very large): pass query with the subject names the student cares about (the lists have no degree names: use subjects pending in webcampus_transcript) to get only the matching passages, and filter with the campus or kind (previos, libres, mri, verano, monserrat, belgrano, recoleta, online). Text comes from table-like PDFs; a PDF whose fonts have no character map comes as page images instead (read them) or, failing that, as its link. For the student\'s own dates use webcampus_course_calendar.',
      inputSchema: {
        topic: z.enum(['calendario', 'inscripciones']).default('calendario'),
        filter: z.string().max(40).optional().describe('document name part: 3sedes, online, costa, feriados, previos, libres, mri, verano, monserrat, belgrano, recoleta…'),
        query: z.string().min(3).max(120).optional().describe('words to look for (subject names, a code): each readable document comes back with only the passages around them; documents without a match come with name and link only'),
      },
      annotations: READ_ONLY,
    },
    ({ topic, filter, query }) =>
      run(granted, 'webcampus.leer', async () => {
        const { value: docs, actualizado } = await // Clave nueva en 0.6.0: la copia local de antes guardaba el texto ilegible por una semana.
        cache.get(`calendario:v2:${topic}`, TTL.semana, () => cal.documentos(topic));
        const f = filter?.toLowerCase().replace(/\s+/g, '');
        const elegidos = f ? docs.filter((d) => (d.nombre + d.url).toLowerCase().replace(/\s+|%20/g, '').includes(f)) : docs;
        // Las imágenes de los PDFs ilegibles van como contenido de imagen del MCP, en el orden de los documentos.
        const imagenes = elegidos.flatMap((d) => d.imagenes ?? []);
        // Con query, cada documento legible trae solo los fragmentos alrededor de las apariciones; los que
        // van como imagen no se filtran (el texto está en la imagen) y los que no tienen ninguna, solo nombre y link.
        const documentos = elegidos.map(({ imagenes, texto, ...d }) => {
          if (!query || imagenes?.length) return { ...d, texto };
          const f = fragmentos(texto, query);
          return f.length ? { ...d, fragmentos: f } : d;
        });
        return elegidos.length
          ? { actualizado, aviso: UNTRUSTED_NOTE, ...(query ? { consulta: query } : {}), documentos, [CON_IMAGENES]: imagenes }
          : { aviso: `Ningún documento coincide con "${filter}".`, disponibles: docs.map((d) => d.nombre) };
      }),
  );
}
