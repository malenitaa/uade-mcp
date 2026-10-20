// Correlativas del plan (WebCampus) y el cálculo de qué se puede cursar y rendir. Datos sintéticos.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elegibilidad } from '../src/sources/planificador/elegibilidad.js';
import { parseCorrelativas } from '../src/sources/webcampus/correlativas.js';
import { PageChangedError, type MateriaHistorial } from '../src/sources/webcampus/parse.js';

const c = parseCorrelativas(readFileSync(new URL('./fixtures/webcampus/correlativas.html', import.meta.url), 'utf8'));
const h = (codigo: string, situacion: MateriaHistorial['situacion'], fechaRegularizacion: string | null = null): MateriaHistorial => ({
  codigo, nombre: codigo, horas: 68, anio: '', situacion, situacionTexto: '', nota: null, notaTexto: null, fechaAprobacion: null, fechaRegularizacion,
});

describe('correlativas', () => {
  it('materias por año y cuatrimestre con sus correlativas anteriores directas (no las de más abajo)', () => {
    expect(c.plan).toBe('99999');
    expect(c.materias).toEqual([
      { codigo: '9.9.001', nombre: 'Base Uno', anio: '1° Año', cuatrimestre: '1° Cuatrimestre', anteriores: [] },
      { codigo: '9.9.002', nombre: 'Base Dos', anio: '1° Año', cuatrimestre: '1° Cuatrimestre', anteriores: [] },
      { codigo: '9.9.010', nombre: 'Avanzada', anio: '2° Año', cuatrimestre: '1° Cuatrimestre', anteriores: ['9.9.001'] },
      { codigo: '9.9.011', nombre: 'Otra Avanzada', anio: '2° Año', cuatrimestre: '1° Cuatrimestre', anteriores: ['9.9.002'] },
      { codigo: '9.9.020', nombre: 'Final', anio: '2° Año', cuatrimestre: '1° Cuatrimestre', anteriores: ['9.9.010', '9.9.011'] },
    ]);
    expect(() => parseCorrelativas('<html><body></body></html>')).toThrow(PageChangedError);
  });
});

describe('elegibilidad', () => {
  it('rendir con correlativas aprobadas; cursar separado según aprobadas, regularizadas o faltantes', () => {
    const e = elegibilidad([h('9.9.001', 'aprobada'), h('9.9.002', 'final_pendiente', '2030-07-21'), h('9.9.010', 'final_pendiente', '2030-12-01')], c);
    expect(e.rendir).toEqual([
      { codigo: '9.9.002', nombre: 'Base Dos', anio: '1° Año', regularizada: '2030-07-21', venceRegularidad: '2032-07-21' },
      { codigo: '9.9.010', nombre: 'Avanzada', anio: '2° Año', regularizada: '2030-12-01', venceRegularidad: '2032-12-01' },
    ]);
    expect(e.cursar).toEqual([]);
    expect(e.cursarConRegularizadas).toEqual([{ codigo: '9.9.011', nombre: 'Otra Avanzada', anio: '2° Año', faltan: ['9.9.002 Base Dos (final pendiente)'] }]);
    expect(e.cursarBloqueadas).toEqual([{ codigo: '9.9.020', nombre: 'Final', anio: '2° Año', faltan: ['9.9.010 Avanzada (final pendiente)', '9.9.011 Otra Avanzada (sin cursar)'] }]);
    expect(e).toMatchObject({ aprobadas: 1, totalPlan: 5 });
  });

  it('un final pendiente con correlativa sin aprobar no se puede rendir; cursando y equivalencias cuentan bien', () => {
    const e = elegibilidad([h('9.9.001', 'equivalencia'), h('9.9.002', 'cursando'), h('9.9.011', 'final_pendiente')], c);
    expect(e.rendirBloqueadas).toEqual([{ codigo: '9.9.011', nombre: 'Otra Avanzada', anio: '2° Año', faltan: ['9.9.002 Base Dos (cursando)'] }]);
    expect(e.cursar.map((x) => x.codigo)).toEqual(['9.9.010']);
    expect(e.cursando).toEqual(['9.9.002 Base Dos']);
    // Otra Avanzada depende de Base Dos, que está cursando: entra en "si terminás lo actual".
    expect(e.cursarSiTerminasLoActual.map((x) => x.codigo)).toEqual([]);
    const f = elegibilidad([h('9.9.001', 'aprobada'), h('9.9.002', 'cursando')], c);
    expect(f.cursarSiTerminasLoActual).toEqual([{ codigo: '9.9.011', nombre: 'Otra Avanzada', anio: '2° Año', faltan: ['9.9.002 Base Dos (cursando)'] }]);
    expect(f.cursarBloqueadas.map((x) => x.codigo)).toEqual(['9.9.020']);
    expect(e.aprobadas).toBe(1);
  });
});
