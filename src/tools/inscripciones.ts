// Tools de solo lectura sobre inscripciones, oferta de clases y equipo docente.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requirePermission, type Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { WebCampus } from '../sources/webcampus/index.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function run(granted: ReadonlySet<Permission>, perm: Permission, fn: () => Promise<unknown>): Promise<Result> {
  try {
    requirePermission(granted, perm);
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}

export function registerInscripcionesTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  insc = new Inscripciones(),
): void {
  server.registerTool(
    'uade_inscripciones',
    {
      title: 'Ventanas de inscripción',
      description:
        'Lista las inscripciones de UADE (cursada, MRI, verano, bajas, etc.) con fecha de apertura y cierre y si están ' +
        'abiertas para vos. Solo lectura: no inscribe ni da de baja.',
      annotations: READ_ONLY,
    },
    () => run(granted, 'pia.leer', () => insc.ventanas()),
  );

  server.registerTool(
    'webcampus_oferta_materias',
    {
      title: 'Materias con clases programadas',
      description:
        'Materias de tu carrera que tienen clases programadas para el próximo período (código y nombre). ' +
        'Usá el código en webcampus_oferta. Solo lectura.',
      annotations: READ_ONLY,
    },
    () => run(granted, 'pia.leer', async () => wc.ofertaMaterias(await insc.linkProgramacion())),
  );

  server.registerTool(
    'webcampus_oferta',
    {
      title: 'Clases ofrecidas de una materia',
      description:
        'Todas las clases programadas de una materia: sede, número de clase, turno, días, horario, fechas, idioma y ' +
        'régimen de aprobación. Sirve para elegir antes de inscribirte. No muestra docentes (ver webcampus_examenes_previos ' +
        'o webcampus_docentes). Solo lectura.',
      inputSchema: {
        materia: z.string().regex(/^[A-Z]?\d+(\.\d+)+$/).describe('código de materia, ej. 3.4.071 (de webcampus_oferta_materias)'),
        turno: z.enum(['MAÑANA', 'TARDE', 'NOCHE']).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ materia, turno }) =>
      run(granted, 'pia.leer', async () => {
        const clases = await wc.oferta(await insc.linkProgramacion(), materia);
        return turno ? clases.filter((c) => c.turno.toUpperCase().includes(turno)) : clases;
      }),
  );

  server.registerTool(
    'webcampus_docentes',
    {
      title: 'Equipo docente de una materia',
      description:
        'Nombre y mail del equipo docente de un aula que estás cursando (idAula de webcampus_cursada). ' +
        'No devuelve datos de tus compañeros. Solo lectura: no envía mails.',
      inputSchema: { idAula: z.string().regex(/^\d+$/) },
      annotations: READ_ONLY,
    },
    ({ idAula }) => run(granted, 'webcampus.leer', () => wc.docentes(idAula)),
  );
}
