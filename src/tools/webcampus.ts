// Tools de solo lectura de WebCampus. Todas exigen el permiso webcampus.leer.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requirePermission, type Permission } from '../auth/permissions.js';
import { WebCampus } from '../sources/webcampus/index.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function run(granted: ReadonlySet<Permission>, fn: () => Promise<unknown>): Promise<Result> {
  try {
    requirePermission(granted, 'webcampus.leer');
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}

export function registerWebCampusTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus()): void {
  server.registerTool(
    'webcampus_periodos',
    {
      title: 'Períodos de cursada',
      description: 'Lista los cuatrimestres/períodos del alumno en WebCampus (id y nombre). Solo lectura.',
      annotations: READ_ONLY,
    },
    () => run(granted, () => wc.periodos()),
  );

  server.registerTool(
    'webcampus_cursada',
    {
      title: 'Materias del cuatrimestre',
      description:
        'Materias del período con día, horario, aula y sede, fechas de cursada, fecha de examen final, ' +
        'notas de cada evaluación y condición final, más links a Teams y apuntes. Sin período, usa el más reciente. Solo lectura.',
      inputSchema: { periodo: z.string().regex(/^\d+$/).optional().describe('id de webcampus_periodos') },
      annotations: READ_ONLY,
    },
    ({ periodo }) => run(granted, () => wc.cursada(periodo)),
  );

  server.registerTool(
    'webcampus_asistencia',
    {
      title: 'Asistencia de una materia',
      description: 'Resumen de asistencia (presentes, inasistencias, sin cargar) y detalle por clase de un aula. Solo lectura.',
      inputSchema: { idAula: z.string().regex(/^\d+$/).describe('idAula de webcampus_cursada') },
      annotations: READ_ONLY,
    },
    ({ idAula }) => run(granted, () => wc.asistencia(idAula)),
  );

  server.registerTool(
    'webcampus_historial',
    {
      title: 'Historial académico',
      description:
        'Todas las materias del plan con su situación (aprobada, final pendiente, cursando, equivalencia, sin cursar), ' +
        'nota, año y fecha de aprobación, más el promedio. Sin plan, usa la carrera activa. Solo lectura.',
      inputSchema: { plan: z.string().regex(/^\d+$/).optional().describe('código de plan, si tenés más de una carrera') },
      annotations: READ_ONLY,
    },
    ({ plan }) => run(granted, () => wc.historial(plan)),
  );

  server.registerTool(
    'webcampus_cuenta',
    {
      title: 'Cuenta corriente',
      description:
        'Deuda vencida, próximos vencimientos y pagos realizados. Solo lectura: este MCP no puede pagar ni generar cupones.',
      annotations: READ_ONLY,
    },
    () => run(granted, () => wc.cuenta()),
  );
}
