// Tabla de aranceles: filas por código (tres tablas en orden), facultad, vigencia y búsqueda por carrera.
import { describe, expect, it } from 'vitest';
import { buscarCarrera, coincidencia, parseAranceles } from '../src/sources/webcampus/aranceles.js';

// Texto sintético con el desorden típico del PDF: títulos después de las filas, valores sueltos.
const texto = [
  'Cod. Facultad Cod.Carr. Facultad de Ingeniería y Ciencias Exactas - Carreras Mañana Tarde Noche',
  '16 Ingeniería Ficticia 489.147 489.147 489.147 131 Lic. en Gestión de la Tecnología Ficticia 489.147 489.147 489.147',
  'V131 Lic. en Gestión de la Tecnología Ficticia (ONLINE) Cod.Carr. Facultad de Comunicación - Carreras Mañana Tarde Noche',
  '73 Lic. en Comunicación Ficticia 512.344 512.344 512.344 Virtual 490.993 ARANCELES VIGENTES A PARTIR DEL 1/10/2030 CAMPUS BUENOS AIRES Valor Matrícula Cuatrimestral | en pesos',
  '16 Ingeniería Ficticia 625.502 562.619 541.430 131 Lic. en Gestión de la Tecnología Ficticia 652.034 573.284 586.444 73 Lic. en Comunicación Ficticia 700.000 600.000 500.000 652.034 519.886',
  'Valor de referencia cuota mensual por 5 inscripciones a Asignatura de 68 hs | en pesos',
  '16 Ingeniería Ficticia 133.791 106.316 103.996 131 Lic. en Gestión de la Tecnología Ficticia 137.272 120.692 123.463 73 Lic. en Comunicación Ficticia 150.000 120.000 100.000',
  'Valores Asignaturas Individuales (valor cuota mensual por asignatura)| en pesos',
  'Campus UADE Costa Argentina P131 Lic. en Gestión de la Tecnología Ficticia ---- 426.440 ---- P131 Lic. en Gestión de la Tecnología Ficticia ---- 568.617 ---- P131 Lic. en Gestión de la Tecnología Ficticia ---- 119.714 ----',
  'Los aranceles del Turno Virtual de carreras presenciales serán equivalentes a los aranceles de Turno Mañana de la misma carrera, a excepción de aquellas que tengan su versión ONLINE. En estos casos, el valor del Turno Virtual tendrá el mismo valor que el de la carrera online.',
  'Cod. Otros Aranceles - Derecho de Admisión 286.000 - Derecho de Admisión - Costa Argentina 209.000 - Gasto Administrativo para Extranjeros - Grado USD 300',
].join(' ');

describe('parseAranceles', () => {
  const a = parseAranceles(texto, 0);

  it('con pocas carreras legibles avisa que el PDF cambió de formato', () => {
    expect(() => parseAranceles(texto)).toThrow('cambió de formato');
  });

  it('una fila por carrera con los tres valores por turno, facultad y campus', () => {
    expect(a.carreras.map((c) => c.codigo)).toEqual(['16', '131', '73', 'P131']);
    expect(a.carreras[1]).toEqual({
      codigo: '131', carrera: 'Lic. en Gestión de la Tecnología Ficticia', facultad: 'Facultad de Ingeniería y Ciencias Exactas', campus: 'Buenos Aires',
      matriculaCuatrimestral: { manana: 489147, tarde: 489147, noche: 489147 },
      cuotaMensual5Materias: { manana: 652034, tarde: 573284, noche: 586444 },
      cuotaMensualPorMateria: { manana: 137272, tarde: 120692, noche: 123463 },
    });
    expect(a.carreras[3]).toMatchObject({ campus: 'Costa Argentina', cuotaMensual5Materias: { manana: null, tarde: 568617, noche: null } });
    // Los valores sueltos después de una fila no inventan filas ni cambian la siguiente.
    expect(a.carreras[2]!.cuotaMensual5Materias).toEqual({ manana: 700000, tarde: 600000, noche: 500000 });
  });

  it('vigencia, derecho de admisión y notas', () => {
    expect(a.vigenciaDesde).toBe('2030-10-01');
    expect(a.derechoAdmision).toBe(286000);
    expect(a.derechoAdmisionCosta).toBe(209000);
    expect(a.notas[0]).toMatch(/^Los aranceles del Turno Virtual/);
  });

  it('busca por nombre, también con el nombre abreviado de WebCampus; Costa solo si se pide', () => {
    expect(coincidencia('LIC. EN GESTIÓN DE TEC. DE LA INF. (PLAN 13121)', 'Lic. en Gestión de la Tecnología de la Información')).toBe(1);
    expect(buscarCarrera(a, 'gestion de tecnologia').map((c) => c.codigo)).toEqual(['131']);
    expect(buscarCarrera(a, 'gestion de tecnologia costa').map((c) => c.codigo)).toEqual(['131', 'P131']);
    expect(buscarCarrera(a, 'ingeniería').map((c) => c.codigo)).toEqual(['16']);
    expect(buscarCarrera(a, 'abogacía')).toEqual([]);
  });
});
