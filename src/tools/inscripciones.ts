// Read-only tools for enrollment windows, the class offering and the schedule planner.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { MAX_MATERIAS, planificar } from '../sources/planificador/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import type { ClaseOfertada } from '../sources/webcampus/parse.js';
import { cache, TTL } from '../cache/cache.js';
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
    () => read(async () => {
      const r = await cache.get('ventanas', TTL.corto, () => insc.ventanas());
      // El link a PIA lleva la sesión: se usa por dentro (pia_class_search), no sale al modelo.
      return { actualizado: r.actualizado, ventanas: r.value.map(({ link: _link, ...v }) => v) };
    }),
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
        if (!subject) {
          const r = await cache.get('oferta-materias', TTL.medio, async () => wc.ofertaMaterias(await insc.linkProgramacion()));
          return { actualizado: r.actualizado, materias: r.value.map((m) => `${m.codigo} ${m.nombre}`) };
        }
        const r = await cache.get(`oferta:${subject}`, TTL.medio, async () => wc.oferta(await insc.linkProgramacion(), subject));
        return { actualizado: r.actualizado, clases: shift ? r.value.filter((c) => c.turno.toUpperCase().includes(shift)) : r.value };
      }),
  );

  server.registerTool(
    'webcampus_schedule_planner',
    {
      title: 'Plan a term schedule without overlaps',
      description:
        'Read-only. Given up to 6 subject codes, combines one class per subject so that days and times never overlap, ranked by fewer campus days, fewer gaps and fewer campuses. Optional filters: shifts, weekdays (L, M, MI, J, V, S), campuses. Returns the best combinations with class numbers (usable in pia_prepare_enrollment), subjects with no matching class, and the conflicting pairs when no full combination exists. Teachers are not in the offering; webcampus_teachers only covers current courses.',
      inputSchema: {
        subjects: z.array(z.string().regex(/^[A-Z]?\d+(\.\d+)+$/)).min(1).max(MAX_MATERIAS),
        shifts: z.array(z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE'])).optional(),
        days: z.array(z.enum(['L', 'M', 'MI', 'J', 'V', 'S'])).optional(),
        campuses: z.array(z.string().max(30)).optional(),
        maxResults: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ subjects, shifts, days, campuses, maxResults }) =>
      read(async () => {
        const oferta = new Map<string, ClaseOfertada[]>();
        let actualizado = '';
        for (const s of new Set(subjects)) {
          const r = await cache.get(`oferta:${s}`, TTL.medio, async () => wc.oferta(await insc.linkProgramacion(), s));
          oferta.set(s, r.value);
          actualizado = actualizado && actualizado < r.actualizado ? actualizado : r.actualizado;
        }
        const r = planificar(oferta, { turnos: shifts, dias: days, sedes: campuses }, maxResults ?? 5);
        return {
          actualizado,
          combinaciones: r.combinaciones.map((c) => ({
            dias: c.diasDeCursada,
            sedes: c.sedes,
            horasHueco: c.horasHueco,
            clases: c.clases.map((x) => ({ materia: x.materia, codigo: x.codigo, clase: x.clase, sede: x.sede, turno: x.turno, dias: x.dias, horario: x.horario, desde: x.desde, hasta: x.hasta })),
          })),
          sinClases: r.sinClases,
          conflictos: r.conflictos,
          aviso: r.truncado ? 'Había demasiadas combinaciones; se muestran las mejores entre las primeras exploradas. Agregá filtros.' : undefined,
        };
      }),
  );
}
