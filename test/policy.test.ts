import { describe, expect, it } from 'vitest';
import { assertAllowed, PolicyError } from '../src/net/policy.js';

describe('allowlist de hosts', () => {
  it.each([
    'https://www.webcampus.uade.edu.ar/Home.aspx?Periodo=1265',
    'https://www.webcampus.uade.edu.ar/AsistenciaAlumnos.aspx?IdAula=1',
    'https://www.webcampus.uade.edu.ar/Contenidos/CuentaCorrientes.aspx',
    'https://inscripciones.uade.edu.ar/Home/ObtenerInscripciones',
    'https://inscripcionespia.uade.edu.ar/InscripcionClaseBuscar.aspx?param=x',
  ])('permite %s', (u) => {
    expect(() => assertAllowed(u)).not.toThrow();
  });

  it.each([
    'https://app.scrapingbee.com/api/v1',
    'https://static.hotjar.com/c/hotjar-1.js',
    'https://www.google-analytics.com/analytics.js',
    'https://webcampus.uade.edu.ar.evil.com/',
    'http://www.webcampus.uade.edu.ar/Home.aspx',
    'https://user:pass@www.webcampus.uade.edu.ar/',
    'https://www.webcampus.uade.edu.ar:8443/',
    'no-es-una-url',
  ])('rechaza %s', (u) => {
    expect(() => assertAllowed(u)).toThrow(PolicyError);
  });
});

describe('lista negra de acciones', () => {
  it.each([
    ['https://www.webcampus.uade.edu.ar/Contenidos/ContenidoDesvincular.aspx?IdAula=1', 'desvincular'],
    ['https://www.webcampus.uade.edu.ar/contenidos/contenidodesvincular.aspx?IdMateria=1', 'desvincular'],
    ['https://www.webcampus.uade.edu.ar/Principal.aspx?MenuItemId=508', 'débito'],
    ['https://www.webcampus.uade.edu.ar/Principal.aspx?MenuItemId=253', 'buscador de personas'],
    ['https://www.webcampus.uade.edu.ar/contenidos/datospersonalescoliving.aspx', 'datos personales'],
    ['https://inscripciones.uade.edu.ar/Home/Logout', 'cerrar sesión'],
    ['https://inscripcionespia.uade.edu.ar/InscripcionInicio.aspx?tipo=CambioAsignaturaPack', 'bajas o cambios'],
    ['https://inscripcionespia.uade.edu.ar/BajaInscripcion.aspx', 'bajas o cambios'],
    ['https://www.webcampus.uade.edu.ar/Pagos/GenerarCupon.aspx', 'pagos'],
    ['https://www.webcampus.uade.edu.ar/Contenido%44esvincular.aspx', 'desvincular'],
  ])('bloquea %s', (u, motivo) => {
    expect(() => assertAllowed(u)).toThrow(motivo);
  });

  it('no bloquea palabras que solo contienen "baja"', () => {
    expect(() => assertAllowed('https://www.webcampus.uade.edu.ar/Trabajar.aspx')).not.toThrow();
  });
});
