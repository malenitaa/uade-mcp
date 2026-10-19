// Planificador de cursada: combinaciones sin solapamiento, filtros y orden por comodidad. Datos sintéticos.
import { describe, expect, it } from 'vitest';
import { pasaFiltros, planificar, solapan } from '../src/sources/planificador/index.js';
import type { ClaseOfertada } from '../src/sources/webcampus/parse.js';

const clase = (codigo: string, clase: string, dias: string[], horario: string | null, over: Partial<ClaseOfertada> = {}): ClaseOfertada => ({
  codigo, materia: `MATERIA ${codigo}`, sede: 'MONSERRAT', clase, regimen: 'SEMANAL', idioma: 'ESPAÑOL', turno: 'MAÑANA',
  anio: 'TERCER AÑO', dias, horario, desde: '2027-03-15', hasta: '2027-07-05', regimenAprobacion: null, ...over,
});

describe('solapan', () => {
  it('mismo día y horario pisado: chocan; distinto día o pegadas: no', () => {
    const a = clase('1', '10', ['L', 'MI'], '07:45 - 11:45');
    expect(solapan(a, clase('2', '20', ['MI'], '10:00 - 14:00'))).toBe(true);
    expect(solapan(a, clase('2', '20', ['M'], '10:00 - 14:00'))).toBe(false);
    expect(solapan(a, clase('2', '20', ['L'], '11:45 - 15:45'))).toBe(false);
  });
  it('sin horario (asincrónica) o con cursadas en fechas distintas: no chocan', () => {
    const a = clase('1', '10', ['L'], '07:45 - 11:45');
    expect(solapan(a, clase('2', '20', ['L'], null))).toBe(false);
    expect(solapan(a, clase('2', '20', ['L'], '08:00 - 12:00', { desde: '2027-08-02', hasta: '2027-12-06' }))).toBe(false);
  });
});

describe('planificar', () => {
  const oferta = new Map<string, ClaseOfertada[]>([
    ['1', [clase('1', '10', ['L'], '07:45 - 11:45'), clase('1', '11', ['M'], '18:30 - 22:30', { turno: 'NOCHE' })]],
    ['2', [clase('2', '20', ['L'], '07:45 - 11:45'), clase('2', '21', ['L'], '11:45 - 15:45', { turno: 'TARDE' })]],
    ['3', [clase('3', '30', ['MI'], '07:45 - 11:45', { sede: 'RECOLETA' })]],
  ]);

  it('arma solo combinaciones sin choques y prefiere menos días y menos huecos', () => {
    const r = planificar(oferta);
    expect(r.combinaciones.map((c) => c.clases.map((x) => x.clase).join('+'))).toEqual(['10+21+30', '11+20+30', '11+21+30']);
    const mejor = r.combinaciones[0]!;
    expect(mejor.diasDeCursada).toEqual(['L', 'MI']);
    expect(mejor.horasHueco).toBe(0);
    expect(mejor.sedes).toEqual(['MONSERRAT', 'RECOLETA']);
    expect(r.conflictos).toEqual([]);
    expect(r.truncado).toBe(false);
  });

  it('filtros por turno, día y sede; materias sin clases quedan aparte', () => {
    const r = planificar(oferta, { turnos: ['mañana'], dias: ['L', 'MI'] });
    expect(r.sinClases).toEqual([]);
    expect(r.combinaciones).toHaveLength(0); // 1 y 2 solo tienen clases de mañana el lunes a la misma hora
    expect(r.conflictos).toEqual(['MATERIA 1 (1) y MATERIA 2 (2) chocan en todas sus clases']);
    const s = planificar(oferta, { sedes: ['Monserrat'] });
    expect(s.sinClases).toEqual(['3']);
    expect(s.combinaciones[0]!.clases).toHaveLength(2);
    expect(pasaFiltros(clase('9', '90', ['S'], '09:00 - 13:00'), { dias: ['L'] })).toBe(false);
  });

  it('más de seis materias se rechaza, y respeta el máximo de resultados', () => {
    const muchas = new Map([...Array(7)].map((_, i) => [String(i), [clase(String(i), String(i), ['L'], null)]]));
    expect(() => planificar(muchas)).toThrow('6 materias');
    expect(planificar(oferta, {}, 1).combinaciones).toHaveLength(1);
  });
});
