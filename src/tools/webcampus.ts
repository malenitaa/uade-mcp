// WebCampus tools. All read-only and behind webcampus.leer. Descriptions are short on purpose:
// they travel with every message the agent sends; shared rules live in the server instructions.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { WebCampus } from '../sources/webcampus/index.js';
import type { MateriaHistorial } from '../sources/webcampus/parse.js';
import { cache, TTL } from '../cache/cache.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { READ_ONLY, run } from './common.js';

const idAula = z.string().regex(/^\d+$/).describe('from webcampus_current_courses');

// Transcript summary: what each status needs and nothing more. sin_cursar collapses to "code name".
function resumirHistorial(materias: MateriaHistorial[]) {
  const de = (s: MateriaHistorial['situacion']) => materias.filter((m) => m.situacion === s);
  return {
    conteo: Object.fromEntries(
      ['aprobada', 'equivalencia', 'final_pendiente', 'cursando', 'sin_cursar'].map((s) => [s, de(s as MateriaHistorial['situacion']).length]),
    ),
    aprobadas: de('aprobada').map((m) => ({ codigo: m.codigo, nombre: m.nombre, nota: m.nota, fecha: m.fechaAprobacion })),
    equivalencias: de('equivalencia').map((m) => `${m.codigo} ${m.nombre}`),
    finalesPendientes: de('final_pendiente').map((m) => ({ codigo: m.codigo, nombre: m.nombre, regularizada: m.fechaRegularizacion })),
    cursando: de('cursando').map((m) => `${m.codigo} ${m.nombre}`),
    sinCursar: de('sin_cursar').map((m) => `${m.codigo} ${m.nombre} (${m.anio.toLowerCase()})`),
  };
}

export function registerWebCampusTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus()): void {
  const read = (fn: () => Promise<unknown>) => run(granted, 'webcampus.leer', fn);

  server.registerTool(
    'webcampus_terms',
    { title: 'Terms', description: "Student's terms (id, name).", annotations: READ_ONLY },
    () => read(async () => {
      const r = await cache.get('periodos', TTL.dia, () => wc.periodos());
      return { actualizado: r.actualizado, periodos: r.value };
    }),
  );

  server.registerTool(
    'webcampus_current_courses',
    {
      title: 'Current courses',
      description: 'Courses of a term (default: latest): idAula, weekday, time, room, dates, final exam date, grades.',
      inputSchema: {
        term: z.string().regex(/^\d+$/).optional(),
        includeLinks: z.boolean().default(false).describe('Teams and notes links'),
      },
      annotations: READ_ONLY,
    },
    ({ term, includeLinks }) =>
      read(async () => {
        const { value: r, actualizado } = await cache.get(`cursada:${term ?? ''}`, TTL.corto, () => wc.cursada(term));
        return { actualizado, periodo: r.periodo.nombre, aulas: r.aulas.map((a) => (includeLinks ? a : { ...a, links: undefined })) };
      }),
  );

  server.registerTool(
    'webcampus_attendance',
    {
      title: 'Attendance',
      description: 'Attendance summary of a course; detail=true adds each class.',
      inputSchema: { idAula, detail: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    ({ idAula: id, detail }) =>
      read(async () => {
        const { value: a, actualizado } = await cache.get(`asistencia:${id}`, TTL.corto, () => wc.asistencia(id));
        return detail ? { actualizado, ...a } : { actualizado, resumen: a.resumen, faltas: a.clases.filter((c) => c.estado === 'ausente' || c.estado === 'media_falta'), aviso: a.aviso };
      }),
  );

  server.registerTool(
    'webcampus_transcript',
    {
      title: 'Transcript',
      description: 'Degree plan status: counts, passed (grade, date), pending finals, current, not taken; average. detail=true for every field.',
      inputSchema: { plan: z.string().regex(/^\d+$/).optional(), detail: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    ({ plan, detail }) =>
      read(async () => {
        const { value: h, actualizado } = await cache.get(`historial:${plan ?? ''}`, TTL.dia, () => wc.historial(plan));
        return detail ? { actualizado, ...h } : { actualizado, carrera: h.carrera, plan: h.plan, promedio: h.promedio, ...resumirHistorial(h.materias) };
      }),
  );

  server.registerTool(
    'webcampus_account_balance',
    {
      title: 'Tuition account',
      description: 'Overdue debt, upcoming due dates and payments (newest first) with their breakdown per subject and late fees (conRecargo). Cannot pay.',
      inputSchema: { allPayments: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    ({ allPayments }) =>
      read(async () => {
        const { value: c, actualizado } = await cache.get('cuenta', TTL.corto, () => wc.cuenta());
        return allPayments
          ? { actualizado, ...c }
          : { actualizado, ...c, pagos: c.pagos.slice(0, 5), pagosTotales: c.pagos.length, pagosConRecargo: c.pagos.filter((p) => p.conRecargo).length };
      }),
  );

  server.registerTool(
    'webcampus_exam_schedule',
    {
      title: 'Final exam schedule',
      description: "Published final exams (date, time, campus, class, examiners). No query: the student's pending/current subjects. Query: code or name.",
      inputSchema: { query: z.string().min(2).max(80).optional() },
      annotations: READ_ONLY,
    },
    ({ query }) =>
      read(async () => {
        const { value: r, actualizado } = await cache.get(`previos:${query ?? ''}`, TTL.medio, () => wc.examenesPrevios(query));
        return { actualizado, aviso: UNTRUSTED_NOTE, filtro: r.filtro, examenes: r.examenes.map((e) => ({ ...e, aula: e.aula === 'A/C' ? 'a confirmar' : e.aula })) };
      }),
  );

  server.registerTool(
    'webcampus_course_calendar',
    {
      title: 'My midterm and final dates',
      description: "Student's own midterm, make-up and final dates per course (with time and room). Best source for 'when is my midterm'.",
      inputSchema: { idAula: idAula.optional(), allClasses: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    ({ idAula: id, allClasses }) =>
      read(async () => {
        const { value: planes, actualizado } = await cache.get(`planificacion:${id ?? 'todas'}`, TTL.medio, async () =>
          id ? [{ idAula: id, ...(await wc.planificacion(id)) }] : await wc.planificaciones(),
        );
        return { actualizado, materias: planes.map((p) => ({
          materia: p.materia,
          idAula: p.idAula,
          actividades: (allClasses ? p.actividades : p.actividades.filter((a) => a.actividad !== 'cursada')).map((a) => ({
            fecha: a.fecha, dia: a.dia, horario: a.horario, actividad: a.actividad, aula: a.aula, sede: a.sede,
          })),
        })) };
      }),
  );

  server.registerTool(
    'webcampus_teachers',
    { title: 'Teaching staff', description: "Name and email of a course's teachers (never classmates).", inputSchema: { idAula }, annotations: READ_ONLY },
    ({ idAula: id }) =>
      read(async () => {
        const r = await cache.get(`docentes:${id}`, TTL.dia, () => wc.docentes(id));
        return { actualizado: r.actualizado, docentes: r.value };
      }),
  );
}
