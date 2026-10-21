// Link a planuade.ar/misemana: datos en el fragmento, hash de integridad, tamaño acotado.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planificar } from '../src/sources/planificador/index.js';
import { buildSemanaLink } from '../src/sources/planificador/link.js';
import type { ClaseOfertada } from '../src/sources/webcampus/parse.js';

const clase = (codigo: string, n: string, dias: string[], horario: string): ClaseOfertada => ({
  codigo, materia: `MATERIA ${codigo}`, sede: 'MONSERRAT', clase: n, regimen: 'SEMANAL', idioma: 'ESPAÑOL', turno: 'NOCHE',
  anio: 'SEGUNDO AÑO', dias, horario, desde: '2031-03-16', hasta: '2031-07-04', regimenAprobacion: null,
});
const r = planificar(new Map([['9.9.001', [clase('9.9.001', '1111', ['M'], '18:30 - 22:30')]], ['9.9.002', [clase('9.9.002', '2222', ['J'], '18:45 - 22:15')]]]));

describe('link de mi semana', () => {
  it('va al fragmento de planuade.ar/misemana con hash válido y las clases', () => {
    const url = buildSemanaLink(r.combinaciones, { carrera: 'LIC. FICTICIA', generado: '01/02/2031 10:00', programacion: null, filtros: 'turno noche' });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://planuade.ar/misemana');
    expect(u.search).toBe('');
    const raw = u.hash.replace(/^#semana=/, '');
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    expect(p.v).toBe(1);
    expect(p.opciones[0].clases.map((c: { clase: string }) => c.clase)).toEqual(['1111', '2222']);
    const { h, ...cuerpo } = p;
    expect(createHash('sha256').update(JSON.stringify(cuerpo)).digest('hex')).toBe(h);
    expect(url.length).toBeLessThan(60000);
  });
  it('sin combinaciones no arma nada', () => {
    expect(() => buildSemanaLink([], { carrera: 'x', generado: '', programacion: null, filtros: '' })).toThrow('No hay combinaciones');
  });
});
