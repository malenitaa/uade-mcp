import { describe, expect, it } from 'vitest';
import { recordatorios, recordatoriosIcs } from '../src/sources/webcampus/recordatorios.js';
import type { ActividadClase } from '../src/sources/webcampus/parse.js';

const act = (fecha: string | null, actividad: ActividadClase['actividad'], over: Partial<ActividadClase> = {}): ActividadClase => ({
  fecha, dia: 'MARTES', horario: '18:30 - 22:30', aula: null, sede: null, actividad, actividadTexto: actividad.toUpperCase(), ...over,
});

const planes = [
  { idAula: '111', materia: 'MATERIA UNO', actividades: [act('2031-03-18', 'cursada'), act('2031-04-22', 'evaluacion', { aula: 'A-101', sede: 'SEDE FICTICIA' }), act('2031-06-10', 'recuperatorio'), act('2031-07-01', 'examen_final', { horario: null })] },
  { idAula: '222', materia: 'MATERIA DOS, CON COMA', actividades: [act('2031-05-06', 'otra', { actividadTexto: 'Entrega TP' }), act(null, 'evaluacion')] },
];

describe('recordatorios de la cursada', () => {
  const lista = recordatorios(planes);

  it('toma parciales, recuperatorios, finales y otras actividades con fecha; deja afuera las clases y lo sin fecha', () => {
    expect(lista.map((r) => `${r.fecha} ${r.titulo}`)).toEqual(['2031-04-22 Parcial', '2031-06-10 Recuperatorio', '2031-07-01 Final', '2031-05-06 Entrega TP']);
  });

  it('el .ics tiene un evento de día entero por fecha, con alarma el día anterior y texto escapado', () => {
    const ics = recordatoriosIcs(lista, new Date('2031-02-01T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4);
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(4);
    expect(ics).toContain('DTSTART;VALUE=DATE:20310422');
    expect(ics).toContain('DTEND;VALUE=DATE:20310423');
    expect(ics).toContain('SUMMARY:Parcial: MATERIA UNO');
    expect(ics).toContain('LOCATION:UADE SEDE FICTICIA');
    expect(ics).toContain('DESCRIPTION:horario 18:30 - 22:30 · aula A-101 · sede SEDE FICTICIA.');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('SUMMARY:Entrega TP: MATERIA DOS\\, CON COMA');
    expect(ics).toContain('DTSTAMP:20310201T120000Z');
  });

  it('el UID es estable por aula, fecha y tipo, y se numera si se repite', () => {
    const ics = recordatoriosIcs(lista);
    expect(ics).toContain('UID:uade-mcp-rec-111-20310422-evaluacion@planuade.ar');
    const doble = recordatoriosIcs(recordatorios([{ idAula: '111', materia: 'X', actividades: [act('2031-04-22', 'evaluacion'), act('2031-04-22', 'evaluacion')] }]));
    expect(doble).toContain('UID:uade-mcp-rec-111-20310422-evaluacion@planuade.ar');
    expect(doble).toContain('UID:uade-mcp-rec-111-20310422-evaluacion-2@planuade.ar');
  });

  it('sin fechas no hay eventos (la tool no escribe el archivo)', () => {
    const vacio = recordatorios([{ idAula: '333', materia: 'SIN PLANIFICACIÓN', actividades: [] }, { idAula: '444', materia: null, actividades: [act('2031-03-18', 'cursada')] }]);
    expect(vacio).toEqual([]);
    expect(recordatoriosIcs(vacio)).not.toContain('BEGIN:VEVENT');
  });
});
