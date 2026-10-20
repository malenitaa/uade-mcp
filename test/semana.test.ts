// Vista de la semana (HTML) y calendario (.ics) a partir de combinaciones del planificador.
import { describe, expect, it } from 'vitest';
import { planificar } from '../src/sources/planificador/index.js';
import { semanaHtml, semanaIcs } from '../src/sources/planificador/semana.js';
import { periodoProgramacion } from '../src/tools/inscripciones.js';
import type { ClaseOfertada } from '../src/sources/webcampus/parse.js';

const clase = (codigo: string, n: string, dias: string[], horario: string, over: Partial<ClaseOfertada> = {}): ClaseOfertada => ({
  codigo, materia: `MATERIA ${codigo}`, sede: 'SEDE FICTICIA', clase: n, regimen: 'SEMANAL', idioma: 'ESPAÑOL', turno: 'NOCHE',
  anio: 'SEGUNDO AÑO', dias, horario, desde: '2031-03-16', hasta: '2031-07-04', regimenAprobacion: null, ...over,
});

const r = planificar(new Map([
  ['9.9.001', [clase('9.9.001', '1111', ['M'], '18:30 - 22:30')]],
  ['9.9.002', [clase('9.9.002', '2222', ['J'], '18:45 - 22:15'), clase('9.9.002', '2223', ['V'], '18:45 - 22:15')]],
]));

describe('vista de la semana', () => {
  const html = semanaHtml(r.combinaciones, { carrera: 'LIC. <FICTICIA>', generado: new Date('2031-02-01T12:00:00Z'), filtros: 'turno noche' });
  it('una pestaña por opción, bloques por día con materia, horario y clase, y nada externo', () => {
    expect((html.match(/role="tab"/g) ?? []).length).toBe(2);
    expect(html).toContain('MATERIA 9.9.001');
    expect(html).toContain('18:30 - 22:30');
    expect(html).toContain('clase 2222');
    expect(html).toContain('del 16/03/2031'.slice(4)); // fechas dd/mm/aaaa en la tabla
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/);
  });
  it('escapa lo que viene de UADE', () => {
    expect(html).toContain('LIC. &lt;FICTICIA&gt;');
    expect(html).not.toContain('<FICTICIA>');
  });
});

describe('calendario .ics', () => {
  const ics = semanaIcs(r.combinaciones[0]!.clases, new Date('2031-02-01T12:00:00Z'));
  it('un evento semanal por clase, desde el primer día que corresponde hasta el fin de la cursada', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    // 16/03/2031 es domingo: el martes siguiente es el 18.
    expect(ics).toContain('DTSTART;TZID=America/Argentina/Buenos_Aires:20310318T183000');
    expect(ics).toContain('DTEND;TZID=America/Argentina/Buenos_Aires:20310318T223000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20310704T235959Z');
    expect(ics).toContain('SUMMARY:MATERIA 9.9.001');
  });
});

describe('período de la programación', () => {
  const clases = [clase('9.9.001', '1', ['L'], '08:00 - 11:00'), clase('9.9.002', '2', ['M'], '08:00 - 11:00', { hasta: '2031-07-11' })];
  it('avisa si la programación publicada es la del cuatrimestre en curso', () => {
    expect(periodoProgramacion(clases, new Date('2031-04-01'))).toMatchObject({ desde: '2031-03-16', hasta: '2031-07-11', aviso: expect.stringContaining('cuatrimestre en curso (16/03/2031 al 11/07/2031)') });
    expect(periodoProgramacion(clases, new Date('2031-02-01'))!.aviso).toBe('Programación del próximo cuatrimestre: clases del 16/03/2031 al 11/07/2031.');
    expect(periodoProgramacion([])).toBeNull();
  });
});
