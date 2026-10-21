// pia_prepare_enrollment (read-only) and pia_confirm_enrollment (write: own permission + human dialog).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { cache, TTL } from '../cache/cache.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { abrirInscripciones } from '../auth/login.js';
import { elegibilidad } from '../sources/planificador/elegibilidad.js';
import { resumenClase, resumenPrevio } from '../sources/pia/alta.js';
import { Pia } from '../sources/pia/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { READ_ONLY, run } from './common.js';

export function registerPiaTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  insc = new Inscripciones(),
  pia = new Pia(),
  abrir: () => Promise<void> = abrirInscripciones,
): void {
  const ventanas = async () => (await cache.get('ventanas', TTL.corto, () => insc.ventanas())).value;
  const fuentesClase = {
    ventanas,
    oferta: async (materia: string) => (await cache.get(`oferta:${materia}`, TTL.medio, async () => wc.oferta(await insc.linkProgramacion(), materia))).value,
  };
  const fuentesPrevio = {
    ventanas,
    examenes: async (materia: string) => (await cache.get(`previos:${materia}`, TTL.medio, () => wc.examenesPrevios(materia))).value.examenes.filter((e) => e.codigo === materia || e.codigo.replace(/^[A-Z]/, '') === materia),
    puedeRendir: async (materia: string) => {
      const [h, c] = await Promise.all([cache.get('historial:', TTL.dia, () => wc.historial()), cache.get('correlativas:', TTL.semana, () => wc.correlativas())]);
      const e = elegibilidad(h.value.materias, c.value);
      if (e.rendir.some((m) => m.codigo === materia)) return { ok: true };
      const b = e.rendirBloqueadas.find((m) => m.codigo === materia);
      if (b) return { ok: false, motivo: `faltan aprobar ${b.faltan!.join(', ')}` };
      const s = h.value.materias.find((m) => m.codigo === materia)?.situacion;
      return { ok: false, motivo: s ? `la materia figura como ${s.replace('_', ' ')}, no como final pendiente` : 'no está en tu plan' };
    },
  };

  server.registerTool(
    'pia_class_search',
    {
      title: 'Search classes in PIA (enrollment system)',
      description:
        'Read-only. Opens an open enrollment window in PIA (default: the first open one; or pass part of its name, e.g. "Verano") and searches the classes of up to 6 subjects there: campus, shift, weekdays, time, dates, free seats (vacantes), how it is passed, and the conditions PIA makes you accept for that class (e.g. intensive courses with fee retention on withdrawal). Also tells why a subject has no classes ("Sin Clases en el Período"). shift is required when the window offers more than one. Nothing is added to the cart.',
      inputSchema: {
        subjects: z.array(z.string().regex(/^[A-Z]?\d+(\.\d+)+$/)).min(1).max(6),
        window: z.string().max(60).optional().describe('part of the window name'),
        shift: z.string().max(20).optional().describe('e.g. MAÑANA, NOCHE, INTENSIVO'),
        days: z.array(z.enum(['L', 'M', 'MI', 'J', 'V', 'S'])).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ subjects, window, shift, days }) =>
      run(granted, 'pia.leer', async () => {
        const ventanas = (await cache.get('ventanas', TTL.corto, () => insc.ventanas())).value;
        const abiertas = ventanas.filter((v) => v.tipo === 'inscripcion' && v.abierta && v.link);
        const ventana = window ? abiertas.find((v) => v.nombre.toLowerCase().includes(window.toLowerCase())) : abiertas[0];
        if (!ventana?.link) {
          throw new Error(abiertas.length ? `No hay una ventana abierta que se llame "${window}". Abiertas: ${abiertas.map((v) => v.nombre).join('; ')}.` : 'No hay ninguna ventana de inscripción abierta ahora.');
        }
        const key = `pia:${ventana.nombre}:${[...subjects].sort().join(',')}:${shift ?? ''}:${(days ?? []).join('')}`;
        const r = await cache.get(key, TTL.corto, () => pia.buscar(ventana.link!, { materias: subjects, turno: shift, dias: days }));
        const { clases, materias, ...resto } = r.value;
        return {
          actualizado: r.actualizado,
          ventana: ventana.nombre,
          ...resto,
          materias: materias.map((m) => ({ codigo: m.codigo, materia: m.materia, anio: m.anio, regimen: m.regimen, estado: m.info ?? (m.chk ? 'con clases' : 'no elegible') })),
          clases: clases.map(({ claseId: _id, btnAlta: _b, ...c }) => c),
        };
      }),
  );

  server.registerTool(
    'pia_prepare_enrollment',
    {
      title: 'Enrollment summary (nothing is sent)',
      description:
        'Read-only. kind "class": checks an open subject window and returns the exact summary for that class (code + class number from webcampus_class_offering / the planner). kind "exam": checks the previos window is open, that the student can sit it (transcript + prerequisites) and returns the exam dates from the official schedule. Both say what happens on Finalizar (charges, seat, whether it can be withdrawn). Show the summary verbatim. Nothing is enrolled; to continue, uade_open_enrollment_site.',
      inputSchema: {
        kind: z.enum(['class', 'exam']),
        subject: z.string().regex(/^[A-Z]?\d+(\.\d+)+$/),
        classNumber: z.string().regex(/^\d+$/).optional().describe('required for kind "class"'),
      },
      annotations: READ_ONLY,
    },
    ({ kind, subject, classNumber }) =>
      run(granted, 'pia.leer', async () => {
        if (kind === 'exam') return resumenPrevio(fuentesPrevio, subject);
        if (!classNumber) throw new Error('Para una materia hace falta el número de clase (classNumber).');
        return resumenClase(fuentesClase, subject, classNumber);
      }),
  );

  server.registerTool(
    'uade_open_enrollment_site',
    {
      title: 'Open the enrollment site for the student',
      description:
        'Opens inscripciones.uade.edu.ar in a visible browser window on the student\'s computer, already signed in, at the list of enrollment windows. It does not navigate further or click anything else: the student enrolls and presses Finalizar themselves. Call it only when the student asks to enroll, after showing the pia_prepare_enrollment summary, and tell them which window and class/exam to pick.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    () =>
      run(granted, 'pia.leer', async () => {
        await abrir();
        return 'Se abrió la ventana de Inscripciones con tu sesión. Elegí la ventana (materias o exámenes previos) → ¡INSCRIBITE!, buscá la materia, agregá la clase o el examen al carrito, confirmá, aceptá términos y condiciones y revisá la última pantalla (arancel y vencimiento) antes de apretar Finalizar.';
      }),
  );
}
