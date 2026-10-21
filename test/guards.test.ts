import { describe, expect, it } from 'vitest';
import { parseCronograma, parseGuia, parseVentanas } from '../src/sources/inscripciones/index.js';
import { parseEvento, parseEventos } from '../src/sources/webcampus/novedades.js';
import { parseClasesDeConsulta } from '../src/sources/webcampus/consultas.js';
import {
  PageChangedError, parseAsistencia, parseCuenta, parseCursada, parseDocentes, parseHistorial,
  parseOferta, parsePeriodos, parsePlanes, parsePlanificacion,
} from '../src/sources/webcampus/parse.js';

// Si UADE cambia el HTML, cada parser tiene que avisar en vez de devolver datos vacíos.
const otraPagina = '<html><body><h1>Página nueva de UADE</h1><table><tr><td>algo</td></tr></table></body></html>';

describe('páginas que cambiaron', () => {
  it.each([
    ['períodos', parsePeriodos], ['cursada', parseCursada], ['asistencia', parseAsistencia], ['planes', parsePlanes],
    ['historial', parseHistorial], ['cuenta', parseCuenta], ['docentes', parseDocentes], ['oferta', parseOferta],
    ['planificación', parsePlanificacion], ['inscripciones', parseVentanas], ['cronograma', parseCronograma], ['guía de inscripciones', parseGuia],
    ['agenda de eventos', parseEventos], ['evento', (h: string) => parseEvento(h, '1')], ['clases de consulta', parseClasesDeConsulta],
  ] as const)('%s avisa que la página cambió', (_, parse) => {
    expect(() => (parse as (h: string) => unknown)(otraPagina)).toThrow(PageChangedError);
  });

  it('planificación sin cargar no es un error', () => {
    expect(parsePlanificacion('<html><body><div class="TITalu">Mi Semana</div></body></html>')).toEqual({ clase: null, materia: null, actividades: [] });
  });
});
