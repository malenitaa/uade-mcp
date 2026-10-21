// Read-only tools for enrollment windows, the class offering and the schedule planner.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { elegibilidad } from '../sources/planificador/elegibilidad.js';
import { MAX_MATERIAS, planificar, sedesPorMateria, variadas } from '../sources/planificador/index.js';
import { semanaHtml, semanaIcs } from '../sources/planificador/semana.js';
import { buildSemanaLink } from '../sources/planificador/link.js';
import { openInBrowser } from '../net/open-browser.js';
import { carpetaSalida, openGeneratedFile } from '../net/open-browser.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebCampus } from '../sources/webcampus/index.js';
import type { ClaseOfertada } from '../sources/webcampus/parse.js';
import { cache, TTL } from '../cache/cache.js';
import { aBase64 } from '../sources/docs/pdf-imagenes.js';
import { fragmentos } from '../sources/webcampus/secciones.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run } from './common.js';

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
    'uade_enrollment_schedule',
    {
      title: 'Enrollment schedule: which day I enroll',
      description:
        'The enrollment calendar UADE publishes as an IMAGE on inscripciones.uade.edu.ar ("Cronograma inscripción"): one column per modality (Campus Costa / online / virtual / MRI, presencial mañana, tarde, noche) and, on the right, a scale of passed subjects (+de 30, 20, 10, 0) that decides each student\'s day; the bottom rows are "Inscripción a Ausente / Recursa / A Final" and "Inscripción a Optativas". Returns the image itself (read it), the student\'s number of passed subjects (transcript), their inferred current shift and the open enrollment windows, so you can answer "¿qué día me toco anotarme?" directly: find the column of the shift, then the row whose band on the right scale contains the number of passed subjects. file=true also saves the image to Downloads/uade-mcp (for clients that cannot see images).',
      inputSchema: {
        file: z.boolean().default(false).describe('also save the image to Downloads/uade-mcp'),
      },
      annotations: READ_ONLY,
    },
    ({ file }) =>
      read(async () => {
        const img = await cache.get('cronograma-imagen', TTL.medio, async () => {
          const c = await insc.cronograma();
          return { url: c.url, alt: c.alt, mimeType: c.mimeType, base64: aBase64(c.bytes) };
        });
        let aprobadas: Record<string, unknown> = { aviso: 'No pude leer el historial para contar las aprobadas; preguntale a la persona cuántas tiene.' };
        try {
          const h = await cache.get('historial:', TTL.dia, () => wc.historial());
          const ap = h.value.materias.filter((m) => m.situacion === 'aprobada').length;
          const eq = h.value.materias.filter((m) => m.situacion === 'equivalencia').length;
          aprobadas = { total: ap + eq, aprobadas: ap, porEquivalencia: eq, finalesPendientes: h.value.materias.filter((m) => m.situacion === 'final_pendiente').length, carrera: h.value.carrera };
        } catch { /* se responde igual con la imagen */ }
        let turno: string | null = null;
        try {
          const c = await cache.get('cursada:', TTL.corto, () => wc.cursada());
          turno = turnoDeCursada(c.value.aulas.filter((a) => /cursada regular/i.test(a.seccion)).map((a) => a.horario));
        } catch { /* sin cursada no hay turno que inferir */ }
        let ventanas: unknown = undefined;
        try {
          const v = await cache.get('ventanas', TTL.corto, () => insc.ventanas());
          ventanas = v.value.map(({ link: _l, ...x }) => x);
        } catch { /* opcional */ }
        const salida: Record<string, unknown> = {
          actualizado: img.actualizado,
          fuente: img.value.url,
          descripcion: img.value.alt,
          aprobadas,
          turnoActualInferido: turno ? `${turno} (por los horarios de las materias que cursa ahora; si va a cambiar de turno, usá el nuevo)` : null,
          comoLeerLaImagen: 'Columnas: modalidad/turno. A la derecha, la escala "Cantidad de materias aprobadas" (0, 10, 20, +de 30): cada celda abarca las cantidades que quedan a su altura. La fecha de la persona es la celda de su columna cuya franja incluye su total de aprobadas. Las filas de abajo (Ausente/Recursa/A Final y Optativas) tienen su propia fecha por columna. Si la imagen no se ve o es de un cuatrimestre pasado (mirá el mes), decilo y pasá el link.',
          ventanasDeInscripcion: ventanas,
          aviso: UNTRUSTED_NOTE,
          [CON_IMAGENES]: [{ mimeType: img.value.mimeType, base64: img.value.base64 }],
        };
        if (file) {
          const ext = img.value.mimeType === 'image/png' ? 'png' : 'jpg';
          salida.archivo = guardarSalidaBytes(`cronograma-inscripcion.${ext}`, Buffer.from(img.value.base64, 'base64'));
        }
        return salida;
      }),
  );

  server.registerTool(
    'uade_enrollment_guide',
    {
      title: 'Enrollment site: notices, tutorials and FAQ',
      description:
        'What inscripciones.uade.edu.ar says besides the windows: the "Importante" notices of the moment (e.g. notebook requirements, Campus Costa modality), the tutorial links (Instructivos) and the official FAQ (when must I enroll, "adeuda correlativas", "las reglas de validación impiden continuar", packs, optativas, MRI, inglés/ENI, teachers not published). query: only the matching notices and questions. Use it for any "cómo me inscribo / por qué no puedo inscribirme" question before answering from general knowledge.',
      inputSchema: { query: z.string().min(3).max(80).optional() },
      annotations: READ_ONLY,
    },
    ({ query }) =>
      read(async () => {
        const g = await cache.get('guia-inscripciones', TTL.dia, () => insc.guia());
        const v = g.value;
        if (!query) return { actualizado: g.actualizado, aviso: UNTRUSTED_NOTE, ...v, ayuda: v.ayuda ? `${v.ayuda} (sitio de ayuda de UADE, fuera del MCP: abrilo vos)` : null };
        const coincide = (t: string) => fragmentos(t, query, 1000).length > 0;
        return {
          actualizado: g.actualizado,
          aviso: UNTRUSTED_NOTE,
          consulta: query,
          importante: v.importante.filter(coincide),
          instructivos: v.instructivos.filter((i) => coincide(i.titulo)),
          preguntasFrecuentes: v.preguntasFrecuentes.filter((p) => coincide(p.pregunta + ' ' + p.respuesta)),
        };
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
  abrirWeb: (url: string) => Promise<void> = openInBrowser,
): void {
  server.registerTool(
    'uade_plan_next_term',
    {
      title: 'Plan my next term (subjects, offering, week)',
      description:
        'One call for "what can I take, what is offered, build my week": crosses transcript + prerequisites (WebCampus) with the class offering WebCampus publishes (the result says which term it is; tell the student if it is still the current one). Without subjects: lists every subject the student can take and whether it is offered, plus what remains in the plan. With up to 6 subjects (codes): checks each one (can take it? offered?) and returns the best non-overlapping weekly combinations, with class numbers for pia_prepare_enrollment. view=true opens planuade.ar/misemana in the browser with every option in a weekly grid (data travel in the URL fragment, never to a server; the page keeps them only in that browser and can export an .ics). file=true instead writes an HTML grid + .ics to Downloads/uade-mcp. Filters: shifts, days, campuses (e.g. MONSERRAT, BELGRANO, RECOLETA, ONLINE). Intensive summer courses (Costa Argentina) only appear if asked for (shift INTENSIVO or campus Pinamar).',
      inputSchema: {
        subjects: z.array(z.string().regex(/^[A-Z]?\d+(\.\d+)+$/)).max(MAX_MATERIAS).optional(),
        shifts: z.array(z.enum(['MAÑANA', 'TARDE', 'NOCHE', 'ONLINE', 'INTENSIVO'])).optional(),
        days: z.array(z.enum(['L', 'M', 'MI', 'J', 'V', 'S'])).optional(),
        campuses: z.array(z.string().max(30)).optional(),
        view: z.boolean().default(false).describe('open the weekly grid at planuade.ar/misemana'),
        file: z.boolean().default(false).describe('write the weekly grid + .ics to Downloads/uade-mcp and open the file'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ subjects, shifts, days, campuses, view, file }) =>
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
          // Con "todo en Belgrano" (o un turno), las materias que ahí no se dictan quedan afuera: se dice dónde sí.
          noEntranConEsosFiltros: r.sinClases.map((cod) => `${cod} ${nombre.get(cod) ?? ''}: con esos filtros no hay clases; se dicta en ${sedesPorMateria(new Map([[cod, oferta.get(cod) ?? []]]))[cod]?.join(', ') || 'ninguna sede'}`),
          conflictos: r.conflictos,
        };
        const filtros = [shifts?.length ? `turno ${shifts.join('/').toLowerCase()}` : '', days?.length ? `días ${days.join(', ')}` : '', campuses?.length ? `sede ${campuses.join('/')}` : ''].filter(Boolean).join(' · ') || 'sin filtros';
        if (view && r.combinaciones.length) {
          const ahora = new Date();
          const generado = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
          const link = buildSemanaLink(r.combinaciones, { carrera: h.value.carrera, generado, programacion: periodo?.aviso ?? null, filtros });
          await abrirWeb(link).catch(() => {});
          resultado.vista = { link, nota: 'Se abrió planuade.ar/misemana en el navegador con las opciones. Los datos van después del # y no salen de ese navegador.' };
        }
        if (file && r.combinaciones.length) {
          const ahora = new Date();
          const sello = ahora.toISOString().slice(0, 16).replace(/[-:T]/g, '');
          const html = escribir(`semana-${sello}.html`, semanaHtml(r.combinaciones, { carrera: h.value.carrera, generado: ahora, filtros, periodo: periodo?.aviso }));
          const ics = escribir(`semana-${sello}.ics`, semanaIcs(r.combinaciones[0]!.clases, ahora));
          await abrir(html).catch(() => {});
          resultado.archivos = { html, calendario: ics, nota: 'Se abrió el archivo en tu navegador. El .ics tiene la opción 1: abrilo para sumarla a tu calendario.' };
        }
        return resultado;
      }),
  );
}

export function guardarSalida(nombre: string, contenido: string | Uint8Array): string {
  const dir = carpetaSalida();
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, nombre.replace(/[^\w.-]/g, '_'));
  writeFileSync(ruta, contenido, { mode: 0o600 });
  return ruta;
}
const guardarSalidaBytes = guardarSalida;

// Turno de cursada según la hora de inicio de las clases (mañana hasta las 12, tarde hasta las 18).
export function turnoDeCursada(horarios: (string | null)[]): string | null {
  const votos: Record<string, number> = {};
  for (const h of horarios) {
    const m = h?.match(/(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const hora = Number(m[1]);
    const t = hora < 12 ? 'mañana' : hora < 18 ? 'tarde' : 'noche';
    votos[t] = (votos[t] ?? 0) + 1;
  }
  const orden = Object.entries(votos).sort((a, b) => b[1] - a[1]);
  if (!orden.length) return null;
  return orden.length > 1 && orden[1]![1] === orden[0]![1] ? `${orden[0]![0]} y ${orden[1]![0]}` : orden[0]![0];
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
