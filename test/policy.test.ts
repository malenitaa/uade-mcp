import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from '../src/net/http.js';
import { assertAllowed, PolicyError, REGISTRO_URL } from '../src/net/policy.js';

describe('allowlist de hosts', () => {
  it.each([
    'https://www.webcampus.uade.edu.ar/Home.aspx?Periodo=1265',
    'https://www.webcampus.uade.edu.ar/AsistenciaAlumnos.aspx?IdAula=1',
    'https://www.webcampus.uade.edu.ar/Contenidos/CuentaCorrientes.aspx',
    'https://inscripciones.uade.edu.ar/Home/ObtenerInscripciones',
    'https://inscripcionespia.uade.edu.ar/InscripcionClaseBuscar.aspx?param=x',
    'https://dre.uade.edu.ar/calendario.pdf',
    'https://www.dre.uade.edu.ar/calendario/2/3sedes_2.pdf',
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

  it('un "%" mal formado (p. ej. en una Location) es URL inválida, no una excepción suelta', () => {
    expect(() => assertAllowed('https://www.webcampus.uade.edu.ar/x%E0%A4%A')).toThrow(PolicyError);
    expect(() => assertAllowed('https://www.webcampus.uade.edu.ar/x?q=%ZZ')).toThrow(PolicyError);
  });
});

// El aviso de versión nueva (src/aviso-version.ts) es el único motivo para hablarle al registro de npm.
describe('registro de npm: una sola URL y un GET pelado', () => {
  afterEach(() => vi.unstubAllGlobals());
  const espiar = (responde: () => Response = () => Response.json({ version: '1.0.0' })) => {
    const pedidos: { url: string; method: string; cabeceras: string[]; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
      pedidos.push({ url: new URL(input).href, method: init.method ?? 'GET', cabeceras: [...new Headers(init.headers).keys()], body: init.body ?? null });
      return responde();
    });
    return pedidos;
  };

  it('permite la URL de la última versión de uade-mcp, y sale sin cookies, sin cabeceras y sin cuerpo', async () => {
    expect(REGISTRO_URL).toBe('https://registry.npmjs.org/uade-mcp/latest');
    const pedidos = espiar();
    await safeFetch(REGISTRO_URL);
    expect(pedidos).toEqual([{ url: REGISTRO_URL, method: 'GET', cabeceras: [], body: null }]);
  });

  it.each([
    'https://registry.npmjs.org/',
    'https://registry.npmjs.org/uade-mcp',
    'https://registry.npmjs.org/uade-mcp/0.7.2',
    'https://registry.npmjs.org/uade-mcp/latest/',
    'https://registry.npmjs.org/uade-mcp/latest?legajo=1',
    'https://registry.npmjs.org/uade-mcp/latest#x',
    'https://registry.npmjs.org/UADE-MCP/latest',
    'https://registry.npmjs.org/uade-mcp%2Flatest',
    'https://registry.npmjs.org/uade-mcp/../uade-mcp/latest/x',
    'https://registry.npmjs.org/otro-paquete/latest',
    'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    'https://registry.npmjs.org/-/v1/search?text=uade',
    'http://registry.npmjs.org/uade-mcp/latest',
    'https://www.npmjs.com/package/uade-mcp',
    'https://registry.npmjs.org.evil.com/uade-mcp/latest',
  ])('rechaza %s', (u) => {
    expect(() => assertAllowed(u)).toThrow(PolicyError);
  });

  it.each([
    ['POST', { method: 'POST' as const, body: 'x=1' }],
    ['POST sin cuerpo', { method: 'POST' as const }],
    ['una cabecera propia', { headers: { 'user-agent': 'uade-mcp/0.8.0' } }],
    ['Authorization', { headers: { authorization: 'Bearer t' } }],
    ['una cookie', { cookie: 'sesion=1' }],
  ])('rechaza %s hacia el registro, sin que salga ningún pedido', async (_caso, req) => {
    const pedidos = espiar();
    await expect(safeFetch(REGISTRO_URL, req)).rejects.toBeInstanceOf(PolicyError);
    expect(pedidos).toHaveLength(0);
  });

  it('una redirección del registro a otra ruta suya no se sigue', async () => {
    const pedidos = espiar(() => new Response(null, { status: 302, headers: { location: '/uade-mcp' } }));
    await expect(safeFetch(REGISTRO_URL)).rejects.toBeInstanceOf(PolicyError);
    expect(pedidos).toHaveLength(1);
  });

  it('respeta los topes de tamaño y de tiempo que pide quien llama', async () => {
    espiar(() => new Response('x'.repeat(2000)));
    await expect(safeFetch(REGISTRO_URL, { maxBytes: 1000 })).rejects.toThrow('demasiado grande');
    vi.stubGlobal('fetch', (_u: URL, init: RequestInit) => new Promise((_, no) => init.signal!.addEventListener('abort', () => no(init.signal!.reason))));
    const t0 = Date.now();
    await expect(safeFetch(REGISTRO_URL, { timeoutMs: 50 })).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
