// Read-only tools for enrollment windows and the class offering.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { READ_ONLY, run } from './common.js';

export function registerInscripcionesTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  insc = new Inscripciones(),
): void {
  const read = (fn: () => Promise<unknown>) => run(granted, 'pia.leer', fn);

  server.registerTool(
    'uade_enrollment_windows',
    {
      title: 'Enrollment windows',
      description: 'Enrollment windows (courses, MRI, summer, withdrawals) with open/close dates and whether open. Cannot enroll.',
      annotations: READ_ONLY,
    },
    () => read(() => insc.ventanas()),
  );

  server.registerTool(
    'webcampus_class_offering',
    {
      title: 'Classes offered for a subject',
      description: 'Next term class schedule. No subject: subjects offered for the degree. With subject code: its classes (campus, shift, weekdays, time, dates, how it is passed).',
      inputSchema: {
        subject: z.string().regex(/^[A-Z]?\d+(\.\d+)+$/).optional().describe('code, e.g. 3.4.071'),
        shift: z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE']).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ subject, shift }) =>
      read(async () => {
        const link = await insc.linkProgramacion();
        if (!subject) return { materias: (await wc.ofertaMaterias(link)).map((m) => `${m.codigo} ${m.nombre}`) };
        const clases = await wc.oferta(link, subject);
        return shift ? clases.filter((c) => c.turno.toUpperCase().includes(shift)) : clases;
      }),
  );
}
