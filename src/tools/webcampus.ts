// WebCampus tools. All read-only and behind webcampus.leer, except webcampus_save_reminders, which
// writes a .ics in Downloads/uade-mcp (the student's disk, never UADE). Descriptions are short on
// purpose: they travel with every message the agent sends; shared rules live in the server instructions.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { guardarEnSalida } from '../net/open-browser.js';
import { WebCampus } from '../sources/webcampus/index.js';
import type { MateriaHistorial } from '../sources/webcampus/parse.js';
import { recordatorios, recordatoriosIcs } from '../sources/webcampus/recordatorios.js';
import { buscarMateria, CODIGO_MATERIA, partesDelPrograma } from '../sources/webcampus/programas.js';
import { ErrorDeUso } from '../error-de-uso.js';
import { cache, TTL } from '../cache/cache.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run } from './common.js';

const MAX_PROGRAMA = 20_000; // caracteres; los programas medidos (11/2026) tienen 10.000 a 15.000

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
    finalesPendientes: de('final_pendiente').map((m) => ({ codigo: m.codigo, nombre: m.nombre, regularizada: m.fechaRegularizacion, venceRegularidad: m.vencimientoRegularidad, finalesDesaprobados: m.intentos.filter((i) => /EXAMEN/i.test(i.condicion) && /REPROBADO|DESAPROBADO|AUSENTE/i.test(i.situacion)).length || undefined })),
    // Cursadas anteriores que no salieron (recursa, ausente): para "¿cuántas veces recursé X?".
    intentosAnteriores: materias
      .map((m) => ({ codigo: m.codigo, nombre: m.nombre, intentos: m.intentos.filter((i) => /ASIGNATURA/i.test(i.condicion) && /RECURSA|AUSENTE|REPROBADO|DESAPROBADO/i.test(i.situacion)).map((i) => `${i.situacion.toLowerCase()} ${i.fecha ?? ''}`.trim()) }))
      .filter((m) => m.intentos.length),
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
      description: 'Degree plan status: counts, passed (grade, date), pending finals (with regularity expiry and failed finals), previous failed/absent attempts per subject, current, not taken; average. detail=true for every field (every act of every subject).',
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
      description: 'Overdue debt; what is billed and not yet due ("Facturado a Vencer": due date, description, amount, breakdown, totalProximosVencimientos); payments (newest first) with their breakdown per subject and late fees (conRecargo); otras: account tables this version cannot read, raw. When does the cuota fall due: look at proximosVencimientos first. Cannot pay.',
      inputSchema: { allPayments: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    ({ allPayments }) =>
      read(async () => {
        const { value: c, actualizado } = await cache.get('cuenta:v2', TTL.corto, () => wc.cuenta());
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

  // Escribe, pero solo en el disco de la persona (Downloads/uade-mcp, nunca pisa un archivo): mismo
  // criterio que webcampus_save_material, sin permiso propio ni diálogo. No manda nada a UADE.
  server.registerTool(
    'webcampus_save_reminders',
    {
      title: 'Save midterm and final dates as calendar reminders (.ics)',
      description:
        "Writes a .ics file in Downloads/uade-mcp with the student's own midterm, make-up and final dates (same data as webcampus_course_calendar): one all-day event per date with a reminder the day before, importable in Apple Calendar, Google Calendar or Outlook. Optional idAula: only that course. Only touches the student's disk; nothing is sent to UADE.",
      inputSchema: { idAula: idAula.optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ idAula: id }) =>
      read(async () => {
        const { value: planes, actualizado } = await cache.get(`planificacion:${id ?? 'todas'}`, TTL.medio, async () =>
          id ? [{ idAula: id, ...(await wc.planificacion(id)) }] : await wc.planificaciones(),
        );
        const lista = recordatorios(planes);
        if (!lista.length) return { actualizado, guardado: null, aviso: 'No hay parciales, recuperatorios ni finales con fecha en la planificación; no escribí ningún archivo.' };
        const nombre = id ? `recordatorios ${lista[0]!.materia}.ics` : 'recordatorios UADE.ics';
        const destino = await guardarEnSalida(nombre, new TextEncoder().encode(recordatoriosIcs(lista)));
        return {
          actualizado,
          guardado: `Lo guardé en ${destino}; abrilo para importarlo en tu calendario.`,
          eventos: lista.map((r) => `${r.fecha} ${r.titulo}: ${r.materia}${r.horario ? ` (${r.horario})` : ''}`),
        };
      }),
  );

  server.registerTool(
    'webcampus_consultation_classes',
    {
      title: 'Consultation classes (clases de consulta)',
      description: "Extra consultation/support classes WebCampus schedules for the student's degree (Mi cursada > Clases de consulta). No subject: which subjects have them. subject (code or part of the name): days, times and details as published.",
      inputSchema: { subject: z.string().min(2).max(80).optional() },
      annotations: READ_ONLY,
    },
    ({ subject }) =>
      read(async () => {
        const r = await cache.get(`consultas:${subject ?? ''}`, TTL.medio, () => wc.clasesDeConsulta(subject));
        const { form: _f, carreras: _c, ...v } = r.value;
        return { actualizado: r.actualizado, ...v, materias: v.materias.map((m) => m.nombre) };
      }),
  );

  server.registerTool(
    'webcampus_course_program',
    {
      title: 'Subject syllabus (programa de la materia)',
      description:
        "Official syllabus (programa) of ANY UADE subject, not only the student's: objectives, units and their topics, class-by-class schedule (cronograma: which units go into each parcial), teaching method, how to pass (attendance, parciales, promoción, final) and bibliography (obligatoria, complementaria), with the program's date and link. subject: code (3.1.024) or a name from the student's degree plan; for another degree's subject pass the code. query (e.g. \"bibliografía\", \"unidad\", \"aprobación\"): only the sections that mention it. What goes into a parcial: no query, read the cronograma at the end.",
      inputSchema: {
        subject: z.string().min(3).max(80).describe('code like 3.1.024 or part of the name'),
        query: z.string().min(3).max(80).optional(),
        modality: z.enum(['presencial', 'virtual']).default('presencial'),
      },
      annotations: READ_ONLY,
    },
    ({ subject, query, modality }) =>
      read(async () => {
        const s = subject.trim();
        let codigo = s;
        if (!CODIGO_MATERIA.test(s)) {
          if (/^[\d.\s]+$/.test(s)) throw new ErrorDeUso(`"${s}" no es un código de materia (tienen la forma 3.1.024).`);
          const h = (await cache.get('historial:', TTL.dia, () => wc.historial())).value;
          const encontradas = buscarMateria(h.materias, s);
          if (!encontradas.length) throw new ErrorDeUso(`"${s}" no está en tu plan (${h.carrera}). Si es de otra carrera, pasá el código de la materia (forma 3.1.024).`);
          if (encontradas.length > 1) throw new ErrorDeUso(`"${s}" coincide con varias materias de tu plan: ${encontradas.map((m) => `${m.codigo} ${m.nombre}`).join('; ')}. Preguntale al estudiante cuál y pasá el código.`);
          codigo = encontradas[0]!.codigo;
        }
        const { value: p, actualizado } = await cache.get(`programa:${codigo}:${modality}`, TTL.mes, () => wc.programa(codigo, modality));
        const { texto, imagenes, ...datos } = p;
        if (query && !imagenes) {
          const partes = partesDelPrograma(texto, query);
          return { actualizado, aviso: UNTRUSTED_NOTE, ...datos, partes: partes.length ? partes : [`No aparece "${query}" en el programa; pedilo sin query para leerlo entero.`] };
        }
        const recortado = texto.length > MAX_PROGRAMA;
        return {
          actualizado,
          aviso: UNTRUSTED_NOTE,
          ...datos,
          texto: recortado ? `${texto.slice(0, MAX_PROGRAMA)} … (recortado: pasá query para buscar una parte)` : texto,
          recortado: recortado || undefined,
          [CON_IMAGENES]: imagenes,
        };
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
