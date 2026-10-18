// Read-only WebCampus tools. All of them require the webcampus.leer permission.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { READ_ONLY, run } from './common.js';

export function registerWebCampusTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus()): void {
  const read = (fn: () => Promise<unknown>) => run(granted, 'webcampus.leer', fn);

  server.registerTool(
    'webcampus_terms',
    {
      title: 'Academic terms',
      description: "The student's terms (cuatrimestres) in WebCampus, with id and name. Read-only.",
      annotations: READ_ONLY,
    },
    () => read(() => wc.periodos()),
  );

  server.registerTool(
    'webcampus_current_courses',
    {
      title: 'Courses of the term',
      description:
        'Courses the student is taking in a term: weekday, time, room and campus, course dates, final exam date, ' +
        'grade of each assessment and final status, plus links to the Teams team and course notes. ' +
        'Without a term, uses the most recent one. Read-only.',
      inputSchema: { term: z.string().regex(/^\d+$/).optional().describe('term id from webcampus_terms') },
      annotations: READ_ONLY,
    },
    ({ term }) => read(() => wc.cursada(term)),
  );

  server.registerTool(
    'webcampus_attendance',
    {
      title: 'Attendance of a course',
      description: 'Attendance summary (present, absent, not yet recorded) and per-class detail for one course. Read-only.',
      inputSchema: { idAula: z.string().regex(/^\d+$/).describe('idAula from webcampus_current_courses') },
      annotations: READ_ONLY,
    },
    ({ idAula }) => read(() => wc.asistencia(idAula)),
  );

  server.registerTool(
    'webcampus_transcript',
    {
      title: 'Academic transcript',
      description:
        "Every subject of the student's degree plan with its status (aprobada, final_pendiente, cursando, " +
        'equivalencia, sin_cursar), grade, year and approval date, plus the grade average. ' +
        'Without a plan, uses the active degree. Read-only.',
      inputSchema: { plan: z.string().regex(/^\d+$/).optional().describe('plan code, only if the student has more than one degree') },
      annotations: READ_ONLY,
    },
    ({ plan }) => read(() => wc.historial(plan)),
  );

  server.registerTool(
    'webcampus_account_balance',
    {
      title: 'Tuition account',
      description:
        'Overdue debt, upcoming due dates and payments made. Read-only: this server cannot pay or generate payment slips.',
      annotations: READ_ONLY,
    },
    () => read(() => wc.cuenta()),
  );

  server.registerTool(
    'webcampus_exam_schedule',
    {
      title: 'Final exam schedule',
      description:
        'Final exams (exámenes previos) published by UADE: date, time, campus, room, class number and examiners. ' +
        'Found automatically in the WebCampus news, so it is always the latest schedule. Without a query, only the ' +
        "student's subjects with a pending final or currently being taken. With a query, filters by subject code " +
        '(e.g. 3.4.071) or name. Exam registration closes 48 h before the exam at 21:00. Read-only.',
      inputSchema: { query: z.string().min(2).max(80).optional().describe('subject code or part of its name') },
      annotations: READ_ONLY,
    },
    ({ query }) => read(() => wc.examenesPrevios(query)),
  );

  server.registerTool(
    'webcampus_teachers',
    {
      title: 'Teaching staff of a course',
      description:
        'Name and email of the teaching staff of a course the student is taking. Never returns classmates’ data. ' +
        'Read-only: it does not send emails.',
      inputSchema: { idAula: z.string().regex(/^\d+$/).describe('idAula from webcampus_current_courses') },
      annotations: READ_ONLY,
    },
    ({ idAula }) => read(() => wc.docentes(idAula)),
  );
}
