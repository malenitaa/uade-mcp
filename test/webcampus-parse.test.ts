import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAsistencia,
  parseCuenta,
  parseCursada,
  parseHistorial,
  parseMoney,
  parsePeriodos,
  parsePlanes,
} from '../src/sources/webcampus/parse.js';

const fx = (name: string) => readFileSync(new URL(`./fixtures/webcampus/${name}`, import.meta.url), 'utf8');

describe('parseMoney', () => {
  it.each([
    ['$111,111.11', 111111.11],
    ['$123.456,78', 123456.78],
    ['$22,222.22', 22222.22],
    ['$1.234.567', 1234567],
    ['$100', 100],
    ['-', null],
  ])('%s → %s', (raw, n) => expect(parseMoney(raw)).toBe(n));
});

describe('fechas', () => {
  it('día/mes/año en general, mes/día/año en el historial, y nunca fechas imposibles', async () => {
    const { parseFecha, parseFechaMDY } = await import('../src/sources/webcampus/parse.js');
    expect(parseFecha('4/08/2030')).toBe('2030-08-04');
    expect(parseFechaMDY('7/17/2024')).toBe('2024-07-17');
    expect(parseFecha('7/17/2024')).toBeNull(); // mes 17
    expect(parseFechaMDY('17/07/2024')).toBeNull();
  });
});

describe('WebCampus', () => {
  it('períodos', () => {
    expect(parsePeriodos(fx('homewc.html'))).toEqual([
      { id: '2002', nombre: '2do Cuatr 2030 - Grado Sede Ficticia' },
      { id: '2001', nombre: '1er Cuatr 2030 - Grado Sede Ficticia' },
    ]);
  });

  it('cursada: aulas, horario, sede y notas', () => {
    const aulas = parseCursada(fx('cursada.html'));
    expect(aulas).toHaveLength(3);
    expect(aulas[0]).toEqual({
      seccion: 'Cursada regular - 2do cuatrimestre de 2030',
      idAula: '900001',
      materia: 'MATERIA DE PRUEBA UNO',
      dia: 'LU',
      horario: '08:00hs - 11:00hs',
      aula: 'Z101 - Sede Ficticia',
      curso: '111111',
      clase: '2222',
      desde: '2030-08-04',
      hasta: '2030-11-30',
      examenFinal: '2030-12-10',
      modalidad: 'Presencial',
      notas: {
        'EVALUACIÓN 1': '8',
        'EVALUACIÓN 2': 'AUS',
        'Recup.': null,
        'Informe Cursada': null,
        'Examen Final': null,
        'Condición Final Materia': null,
      },
      links: {
        teams: expect.stringContaining('https://teams.microsoft.com/'),
        apuntesTeams: expect.stringContaining('sharepoint.com'),
        apuntesMateria: expect.stringContaining('sharepoint.com'),
      },
    });
    expect(aulas[1]).toMatchObject({ materia: 'MATERIA DE PRUEBA DOS', examenFinal: null, notas: { 'EVALUACIÓN 3': null, 'ENTREGA FINAL': null } });
    expect(aulas[2]).toMatchObject({ seccion: expect.stringContaining('examen previo'), idAula: '900003', dia: 'SA' });
  });

  it('asistencia', () => {
    const a = parseAsistencia(fx('asistencia.html'));
    expect(a.resumen).toEqual({ totalClases: 16, dictadas: 6, sinCargar: 1, presentes: 3, inasistencias: 2 });
    expect(a.clases).toEqual([
      { mes: 'Agosto', dia: 4, estado: 'presente' },
      { mes: 'Agosto', dia: 11, estado: 'presente' },
      { mes: 'Agosto', dia: 18, estado: 'feriado' },
      { mes: 'Agosto', dia: 25, estado: 'ausente' },
      { mes: 'Septiembre', dia: 1, estado: 'media_falta' },
      { mes: 'Septiembre', dia: 8, estado: 'presente' },
      { mes: 'Septiembre', dia: 15, estado: 'sin_cargar' },
    ]);
    expect(a.aviso).toContain('75 %');
  });

  it('planes: carreras y postback', () => {
    const { planes, form } = parsePlanes(fx('planes.html'));
    expect(planes).toEqual([{ plan: '99999', carrera: 'LIC. DE PRUEBA', estado: 'Activa', postbackTarget: 'ctl00$ContentPlaceHolderMain$ctl00' }]);
    expect(form.__VIEWSTATE).toBe('VIEWSTATE_FICTICIO');
  });

  it('historial: situaciones, notas y fechas', () => {
    const h = parseHistorial(fx('historial.html'));
    expect(h.promedio).toBe(9);
    expect(h.materias.map((m) => [m.codigo, m.situacion, m.nota, m.anio])).toEqual([
      ['9.9.001', 'aprobada', 8, 'PRIMER AÑO'],
      ['9.9.002', 'aprobada', 10, 'PRIMER AÑO'],
      ['9.9.003', 'equivalencia', null, 'PRIMER AÑO'],
      ['9.9.004', 'final_pendiente', null, 'SEGUNDO AÑO'],
      ['9.9.005', 'cursando', null, 'SEGUNDO AÑO'],
      ['9.9.006', 'sin_cursar', null, 'SEGUNDO AÑO'],
      ['9.9.007', 'sin_cursar', null, 'OPTATIVAS'],
    ]);
    expect(h.materias[0]).toMatchObject({ nombre: 'MATERIA APROBADA', horas: 68, fechaAprobacion: '2028-12-15' });
    expect(h.materias[1]?.fechaAprobacion).toBe('2029-03-05'); // día sin cero adelante
    expect(h.materias[3]).toMatchObject({ notaTexto: 'A FINAL PREVIO', fechaRegularizacion: '2029-12-02' });
  });

  it('cuenta corriente: sin deuda, vencimientos y pagos', () => {
    const c = parseCuenta(fx('cuenta.html'));
    expect(c.deudaVencida).toEqual([]);
    expect(c.proximosVencimientos).toEqual([{ Vencimiento: '2030-11-10', Concepto: 'CUOTA 4 2DO CUATR 2030', Importe: 123456.78 }]);
    expect(c.pagos).toEqual([
      { 'Fecha Pago': '2030-10-10', 'Nro. Recibo': 'RC-0000-00000001', Medio: 'Medio Ficticio 1', Total: 111111.11 },
      { 'Fecha Pago': '2030-09-10', 'Nro. Recibo': 'RC-0000-00000002', Medio: 'Medio Ficticio 2', Total: 22222.22 },
    ]);
  });
});
