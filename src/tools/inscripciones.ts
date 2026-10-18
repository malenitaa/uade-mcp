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
      description:
        'UADE enrollment windows (regular courses, intensive MRI, summer, withdrawals, etc.) with opening and closing ' +
        'date and whether they are open for the student. Read live from the enrollment site. ' +
        'Read-only: it does not enroll or withdraw.',
      annotations: READ_ONLY,
    },
    () => read(() => insc.ventanas()),
  );

  server.registerTool(
    'webcampus_offered_subjects',
    {
      title: 'Subjects with scheduled classes',
      description:
        "Subjects of the student's degree that have classes scheduled for the next term (code and name). " +
        'Use the code with webcampus_class_offering. Read-only.',
      annotations: READ_ONLY,
    },
    () => read(async () => wc.ofertaMaterias(await insc.linkProgramacion())),
  );

  server.registerTool(
    'webcampus_class_offering',
    {
      title: 'Classes offered for a subject',
      description:
        'Every scheduled class of a subject: campus, class number, shift, weekdays, time, dates, language and how it is ' +
        'passed (final exam, promotion, final project). Useful to choose before enrolling. It does not list teachers ' +
        '(see webcampus_exam_schedule or webcampus_teachers). Read-only.',
      inputSchema: {
        subject: z.string().regex(/^[A-Z]?\d+(\.\d+)+$/).describe('subject code, e.g. 3.4.071 (from webcampus_offered_subjects)'),
        shift: z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE']).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ subject, shift }) =>
      read(async () => {
        const clases = await wc.oferta(await insc.linkProgramacion(), subject);
        return shift ? clases.filter((c) => c.turno.toUpperCase().includes(shift)) : clases;
      }),
  );
}
