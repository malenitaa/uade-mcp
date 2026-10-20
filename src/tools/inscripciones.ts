// Read-only tools for enrollment windows, the class offering and the schedule planner.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { elegibilidad } from '../sources/planificador/elegibilidad.js';
import { MAX_MATERIAS, planificar, sedesPorMateria, variadas } from '../sources/planificador/index.js';
import { semanaHtml, semanaIcs } from '../sources/planificador/semana.js';
import { carpetaSalida, openGeneratedFile } from '../net/open-browser.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
      description: 'Class schedule published in WebCampus (usually next term; if the next one is not published yet, it is the current one: check the dates). No subject: subjects offered for the degree. With subject code: its classes (campus, shift, weekdays, time, dates, how it is passed).',
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
        shifts: z.array(z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE', 'INTENSIVO'])).optional(),
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
        const todas = planificar(oferta, { turnos: shifts, dias: days, sedes: campuses }, Number.MAX_SAFE_INTEGER);
        const r = { ...todas, combinaciones: variadas(todas.combinaciones, maxResults ?? 5) };
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

export function registerElegibilidadTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus(), insc = new Inscripciones()): void {
  server.registerTool(
    'uade_eligible_subjects',
    {
      title: 'What I can take and which finals I can sit',
      description:
        'Computed from WebCampus only (transcript + the plan\'s prerequisites page): finals the student can sit now (pending final + all prerequisites passed, with regularity expiry), subjects they can take (all prerequisites passed; marked if offered next term), subjects whose prerequisites are only regularized (PIA decides), and blocked ones with what is missing. Use it before the schedule planner or any enrollment question.',
      inputSchema: { plan: z.string().regex(/^\d+$/).optional() },
      annotations: READ_ONLY,
    },
    ({ plan }) =>
      run(granted, 'webcampus.leer', async () => {
        const [h, c] = await Promise.all([
          cache.get(`historial:${plan ?? ''}`, TTL.dia, () => wc.historial(plan)),
          cache.get(`correlativas:${plan ?? ''}`, TTL.semana, () => wc.correlativas(plan)),
        ]);
        const e = elegibilidad(h.value.materias, c.value);
        // Si se puede, marca cuáles se dictan el próximo cuatrimestre (programación de clases).
        let ofrecidas: Set<string> | null = null;
        try {
          const o = await cache.get('oferta-materias', TTL.medio, async () => wc.ofertaMaterias(await insc.linkProgramacion()));
          ofrecidas = new Set(o.value.map((m) => m.codigo));
        } catch {
          /* sin programación publicada: se omite la marca */
        }
        const marcar = <T extends { codigo: string }>(xs: T[]) => (ofrecidas ? xs.map((x) => ({ ...x, seDicta: ofrecidas!.has(x.codigo) })) : xs);
        return {
          actualizado: h.actualizado,
          carrera: h.value.carrera,
          plan: c.value.plan,
          progreso: `${e.aprobadas} de ${e.totalPlan} materias del plan aprobadas`,
          podesRendir: e.rendir,
          rendirBloqueadas: e.rendirBloqueadas,
          podesCursar: marcar(e.cursar),
          cursarConCorrelativasRegularizadas: marcar(e.cursarConRegularizadas),
          cursarBloqueadas: e.cursarBloqueadas,
          cursando: e.cursando,
          nota: 'Rendir: final pendiente y correlativas anteriores aprobadas. La regla exacta para cursar con correlativas solo regularizadas la aplica PIA (muestra solo las materias habilitadas). La regularidad vence a los 2 años de regularizada.',
        };
      }),
  );
}

// Todo el armado del cuatrimestre en un pedido: qué podés cursar (historial + correlativas), qué de
// eso se dicta, las mejores semanas sin superposiciones y, si querés, la vista en tu navegador.
export function registerPlanCuatrimestreTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  insc = new Inscripciones(),
  escribir: (nombre: string, contenido: string) => string = guardarSalida,
  abrir: (ruta: string) => Promise<void> = openGeneratedFile,
): void {
  server.registerTool(
    'uade_plan_next_term',
    {
      title: 'Plan my next term (subjects, offering, week)',
      description:
        'One call for "what can I take, what is offered, build my week": crosses transcript + prerequisites (WebCampus) with the class offering WebCampus publishes (the result says which term it is; tell the student if it is still the current one). Without subjects: lists every subject the student can take and whether it is offered, plus what remains in the plan. With up to 6 subjects (codes): checks each one (can take it? offered?) and returns the best non-overlapping weekly combinations, with class numbers for pia_prepare_enrollment. view=true also writes a weekly calendar (HTML grid with every option + .ics for the best one) to Downloads/uade-mcp and opens it in the browser. Filters: shifts, days, campuses (e.g. MONSERRAT, BELGRANO, RECOLETA, ONLINE). Intensive summer courses (Costa Argentina) only appear if asked for (shift INTENSIVO or campus Pinamar).',
      inputSchema: {
        subjects: z.array(z.string().regex(/^[A-Z]?\d+(\.\d+)+$/)).max(MAX_MATERIAS).optional(),
        shifts: z.array(z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE', 'INTENSIVO'])).optional(),
        days: z.array(z.enum(['L', 'M', 'MI', 'J', 'V', 'S'])).optional(),
        campuses: z.array(z.string().max(30)).optional(),
        view: z.boolean().default(false).describe('write and open the weekly calendar file'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ subjects, shifts, days, campuses, view }) =>
      run(granted, 'webcampus.leer', async () => {
        const [h, c] = await Promise.all([
          cache.get('historial:', TTL.dia, () => wc.historial()),
          cache.get('correlativas:', TTL.semana, () => wc.correlativas()),
        ]);
        const e = elegibilidad(h.value.materias, c.value);
        const link = await insc.linkProgramacion();
        const ofrecidas = new Set((await cache.get('oferta-materias', TTL.medio, () => wc.ofertaMaterias(link))).value.map((m) => m.codigo));
        const puede = new Map([
          ...e.cursar.map((m) => [m.codigo, 'si'] as const),
          ...e.cursarConRegularizadas.map((m) => [m.codigo, 'con_regularizadas'] as const),
          ...e.cursarSiTerminasLoActual.map((m) => [m.codigo, 'si_terminas'] as const),
        ]);
        const nombre = new Map(c.value.materias.map((m) => [m.codigo, m.nombre]));

        if (!subjects?.length) {
          const candidatas = [...e.cursar, ...e.cursarConRegularizadas];
          // Para saber de qué cuatrimestre es la programación, alcanza con las clases de una materia.
          const muestra = [...candidatas, ...e.cursarSiTerminasLoActual].find((m) => ofrecidas.has(m.codigo));
          const periodo = muestra ? periodoProgramacion((await cache.get(`oferta:${muestra.codigo}`, TTL.medio, () => wc.oferta(link, muestra.codigo))).value) : null;
          return {
            actualizado: h.actualizado,
            programacion: periodo,
            carrera: h.value.carrera,
            progreso: `${e.aprobadas} de ${e.totalPlan} materias del plan aprobadas`,
            podesCursarYSeDictan: candidatas.filter((m) => ofrecidas.has(m.codigo)).map((m) => ({ codigo: m.codigo, nombre: m.nombre, anio: m.anio, correlativas: puede.get(m.codigo) === 'si' ? 'aprobadas' : `regularizadas (${m.faltan?.join(', ')}); PIA confirma` })),
            podesCursarPeroNoSeDictan: candidatas.filter((m) => !ofrecidas.has(m.codigo)).map((m) => `${m.codigo} ${m.nombre}`),
            siAprobasLoQueEstasCursando: e.cursarSiTerminasLoActual.map((m) => ({ codigo: m.codigo, nombre: m.nombre, seDicta: ofrecidas.has(m.codigo), depende: m.faltan })),
            cursando: e.cursando,
            todaviaNo: e.cursarBloqueadas.map((m) => ({ codigo: m.codigo, nombre: m.nombre, faltan: m.faltan })),
            finalesQuePodesRendir: e.rendir.map((m) => `${m.codigo} ${m.nombre}`),
            siguiente: 'Elegí hasta 6 entre "podesCursarYSeDictan" y "siAprobasLoQueEstasCursando" (las que se dictan) y volvé a llamar con subjects (y view=true para ver la semana).',
          };
        }

        const avisos: string[] = [];
        const oferta = new Map<string, ClaseOfertada[]>();
        for (const s of new Set(subjects)) {
          const n = nombre.get(s) ?? s;
          if (!ofrecidas.has(s)) { avisos.push(`${s} ${n}: no se dicta el próximo cuatrimestre.`); continue; }
          const p = puede.get(s);
          if (!p) {
            const b = e.cursarBloqueadas.find((m) => m.codigo === s);
            const st = h.value.materias.find((m) => m.codigo === s)?.situacion;
            avisos.push(b ? `${s} ${n}: todavía no la podés cursar (faltan ${b.faltan?.join(', ')}).` : `${s} ${n}: figura como ${st?.replace('_', ' ') ?? 'fuera de tu plan'}.`);
            continue;
          } else if (p === 'con_regularizadas') avisos.push(`${s} ${n}: tenés correlativas solo regularizadas; PIA decide si te deja.`);
          else if (p === 'si_terminas') avisos.push(`${s} ${n}: depende de lo que estás cursando (${e.cursarSiTerminasLoActual.find((m) => m.codigo === s)?.faltan?.join(', ')}); PIA la habilita cuando se cargue la nota.`);
          oferta.set(s, (await cache.get(`oferta:${s}`, TTL.medio, () => wc.oferta(link, s))).value);
        }
        if (!oferta.size) return { avisos, combinaciones: [] };

        const todas = planificar(oferta, { turnos: shifts, dias: days, sedes: campuses }, Number.MAX_SAFE_INTEGER);
        const r = { ...todas, combinaciones: variadas(todas.combinaciones, 5) };
        const periodo = periodoProgramacion([...oferta.values()].flat());
        const resultado: Record<string, unknown> = {
          actualizado: h.actualizado,
          programacion: periodo,
          dondeSeDicta: sedesPorMateria(oferta),
          avisos,
          combinaciones: r.combinaciones.map((cb, i) => ({
            opcion: i + 1,
            dias: cb.diasDeCursada,
            horasHueco: cb.horasHueco,
            sedes: cb.sedes,
            clases: cb.clases.map((x) => ({ materia: x.materia, codigo: x.codigo, clase: x.clase, sede: x.sede, turno: x.turno, dias: x.dias, horario: x.horario, desde: x.desde, hasta: x.hasta })),
          })),
          sinClasesConEsosFiltros: r.sinClases,
          conflictos: r.conflictos,
        };
        if (view && r.combinaciones.length) {
          const filtros = [shifts?.length ? `turno ${shifts.join('/').toLowerCase()}` : '', days?.length ? `días ${days.join(', ')}` : '', campuses?.length ? `sede ${campuses.join('/')}` : ''].filter(Boolean).join(' · ') || 'sin filtros';
          const ahora = new Date();
          const sello = ahora.toISOString().slice(0, 16).replace(/[-:T]/g, '');
          const html = escribir(`semana-${sello}.html`, semanaHtml(r.combinaciones, { carrera: h.value.carrera, generado: ahora, filtros, periodo: periodo?.aviso }));
          const ics = escribir(`semana-${sello}.ics`, semanaIcs(r.combinaciones[0]!.clases, ahora));
          await abrir(html).catch(() => {});
          resultado.vista = { html, calendario: ics, nota: 'Se abrió la vista en tu navegador. El .ics tiene la opción 1: abrilo para sumarla a tu calendario.' };
        }
        return resultado;
      }),
  );
}

export function guardarSalida(nombre: string, contenido: string): string {
  const dir = carpetaSalida();
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, nombre.replace(/[^\w.-]/g, '_'));
  writeFileSync(ruta, contenido, { mode: 0o600 });
  return ruta;
}

// De qué cuatrimestre es la programación de clases: WebCampus muestra la del cuatrimestre en curso
// hasta que publica la del siguiente. Se avisa para que nadie arme la semana con horarios viejos.
export function periodoProgramacion(clases: ClaseOfertada[], hoy = new Date()): { desde: string; hasta: string; aviso: string } | null {
  const desdes = clases.map((c) => c.desde).filter((d): d is string => !!d).sort();
  const hastas = clases.map((c) => c.hasta).filter((d): d is string => !!d).sort();
  if (!desdes.length || !hastas.length) return null;
  const desde = desdes[0]!, hasta = hastas[hastas.length - 1]!;
  const hoyIso = hoy.toISOString().slice(0, 10);
  const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const aviso = desde <= hoyIso
    ? `Ojo: la programación publicada es la del cuatrimestre en curso (${f(desde)} al ${f(hasta)}). La del próximo todavía no está; los horarios pueden cambiar.`
    : `Programación del próximo cuatrimestre: clases del ${f(desde)} al ${f(hasta)}.`;
  return { desde, hasta, aviso };
}
