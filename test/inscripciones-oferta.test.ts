import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLinkProgramacion, parseVentanas } from '../src/sources/inscripciones/index.js';
import { parseDocentes, parseOferta } from '../src/sources/webcampus/parse.js';

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8');

describe('inscripciones', () => {
  it('ventanas con fechas, tipo y si están abiertas', () => {
    expect(parseVentanas(fx('inscripciones/obtener.html'))).toEqual([
      { sede: 'Buenos Aires - Grado', nombre: 'Cursos Regulares Intensivos (MRI) 2do Cuatrimestre 2030', tipo: 'inscripcion', abierta: true, desde: '2030-08-03T12:00', hasta: '2030-12-03' },
      { sede: 'Buenos Aires - Grado', nombre: 'Bajas 2do Cuatrimestre 2030', tipo: 'bajas_o_cambios', abierta: true, desde: '2030-08-01T00:00', hasta: '2030-10-31' },
      { sede: 'Buenos Aires - Grado', nombre: 'Asignaturas Verano 2031', tipo: 'otro', abierta: false, desde: '2030-10-05T12:00', hasta: '2031-02-28' },
    ]);
  });

  it('link a la Programación de Clases (solo si apunta a WebCampus)', () => {
    expect(parseLinkProgramacion(fx('inscripciones/home.html'))).toBe('/MiProgramacion/Contenidos/MiProgramacion.aspx?IdUsuario=FICTICIO123=');
    expect(parseLinkProgramacion('<a class="btn_verdisp" href="https://evil.example/MiProgramacion/Contenidos/MiProgramacion.aspx?IdUsuario=x">x</a>')).toBeNull();
  });
});

describe('oferta de clases', () => {
  const o = parseOferta(fx('webcampus/oferta.html'));

  it('materias del filtro', () => {
    expect(o.materias).toEqual([
      { codigo: '9.9.101', nombre: 'MATERIA OFERTA UNO' },
      { codigo: '9.9.102', nombre: 'MATERIA OFERTA DOS' },
    ]);
  });

  it('clases con días marcados por color, horario y fechas', () => {
    expect(o.clases).toEqual([
      { codigo: '9.9.101', materia: 'MATERIA OFERTA UNO', sede: 'SEDE FICTICIA', clase: '1111', regimen: 'CUATRIMESTRAL', idioma: 'ESPAÑOL', turno: 'MAÑANA', anio: 'PRIMER AÑO', dias: ['L', 'J'], horario: '08:00 - 11:00', desde: '2030-08-04', hasta: '2030-11-30', regimenAprobacion: 'CON EXAMEN FINAL' },
      { codigo: '9.9.101', materia: 'MATERIA OFERTA UNO', sede: 'OTRA SEDE', clase: '2222', regimen: 'CUATRIMESTRAL', idioma: 'ESPAÑOL', turno: 'NOCHE', anio: 'PRIMER AÑO', dias: ['MI'], horario: '18:30 - 22:00', desde: '2030-08-04', hasta: '2030-11-30', regimenAprobacion: 'PROMOCIONABLE' },
    ]);
  });

  it('después de la página 10 sigue por el "..."', () => {
    const html = fx('webcampus/oferta.html').replace(
      /<div class="rgNumPart">[\s\S]*?<\/div>/,
      '<div class="rgNumPart"><a href="javascript:__doPostBack(\'p9\',\'\')"><span>9</span></a><a class="rgCurrentPage" href="javascript:__doPostBack(\'p10\',\'\')"><span>10</span></a><a href="javascript:__doPostBack(\'mas\',\'\')"><span>...</span></a></div>',
    );
    expect(parseOferta(html).siguientePagina).toBe('mas');
  });

  it('paginado y estado del formulario para el postback', () => {
    expect(o.siguientePagina).toBe('ctl00$ContentPlaceHolderMain$RadGrid1$ctl00$ctl03$ctl01$ctl05');
    expect(o.form['ctl00$ContentPlaceHolderMain$ddlCuatri']).toBe('111||2030');
    expect(o.form.__VIEWSTATE).toBe('VS_OFERTA');
  });
});

describe('docentes', () => {
  it('devuelve solo docentes, nunca compañeros ni legajos', () => {
    const d = parseDocentes(fx('webcampus/integrantes.html'));
    expect(d).toEqual([
      { nombre: 'Docente, Ficticia', email: 'dficticia@example.edu.ar' },
      { nombre: 'Ayudante, Otro', email: 'aotro@example.edu.ar' },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/companera|0000003|000000/);
  });
});
