// Recordatorios de la cursada en formato iCalendar (.ics): un evento de día entero por parcial,
// recuperatorio, final u otra actividad que no sea una clase común, con una alarma el día anterior.
// Es una función pura sobre lo que ya devuelve la planificación de cada aula; no toca la red.
import type { ActividadClase, TipoActividad } from './parse.js';

export interface PlanificacionConAula {
  idAula: string;
  materia: string | null;
  actividades: ActividadClase[];
}

export interface Recordatorio {
  idAula: string;
  materia: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoActividad;
  titulo: string; // "Parcial", "Final"…
  horario: string | null;
  aula: string | null;
  sede: string | null;
}

const TITULO: Record<Exclude<TipoActividad, 'cursada'>, string | null> = {
  evaluacion: 'Parcial',
  recuperatorio: 'Recuperatorio',
  examen_final: 'Final',
  otra: null, // se usa el texto que puso el docente
};

// Qué va al calendario: todo lo que no sea una clase común y tenga fecha.
export function recordatorios(planes: PlanificacionConAula[]): Recordatorio[] {
  return planes.flatMap((p) =>
    p.actividades.flatMap((a) => {
      if (a.actividad === 'cursada' || !a.fecha) return [];
      return [{
        idAula: p.idAula,
        materia: p.materia ?? `aula ${p.idAula}`,
        fecha: a.fecha,
        tipo: a.actividad,
        titulo: TITULO[a.actividad] ?? (a.actividadTexto.trim() || 'Actividad'),
        horario: a.horario,
        aula: a.aula,
        sede: a.sede,
      }];
    }),
  );
}

const icsTexto = (s: string): string => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
const diaIcs = (fecha: string): string => fecha.replace(/-/g, '');
const diaSiguiente = (fecha: string): string => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function recordatoriosIcs(lista: Recordatorio[], generado = new Date()): string {
  const stamp = generado.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const vistos = new Map<string, number>();
  const eventos = lista.flatMap((r) => {
    // UID estable por materia, fecha y tipo: al reimportar el archivo, el calendario actualiza
    // el evento en vez de duplicarlo. Si el mismo día hay dos del mismo tipo, se numeran.
    const base = `uade-mcp-rec-${r.idAula}-${diaIcs(r.fecha)}-${r.tipo}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const detalle = [r.horario && `horario ${r.horario}`, r.aula && `aula ${r.aula}`, r.sede && `sede ${r.sede}`].filter(Boolean).join(' · ');
    return [
      'BEGIN:VEVENT',
      `UID:${base}${n > 1 ? `-${n}` : ''}@planuade.ar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${diaIcs(r.fecha)}`,
      `DTEND;VALUE=DATE:${diaIcs(diaSiguiente(r.fecha))}`,
      `SUMMARY:${icsTexto(`${r.titulo}: ${r.materia}`)}`,
      ...(r.sede ? [`LOCATION:${icsTexto(`UADE ${r.sede}`)}`] : []),
      `DESCRIPTION:${icsTexto(`${detalle ? `${detalle}. ` : ''}Generado por Plan UADE MCP con la planificación de WebCampus; confirmalo con el docente.`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsTexto(`Mañana: ${r.titulo} de ${r.materia}`)}`,
      'TRIGGER:-PT15H', // a las 9 del día anterior (el evento empieza a las 0)
      'END:VALARM',
      'END:VEVENT',
    ];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan UADE MCP//Recordatorios//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR', ''].join('\r\n');
}
