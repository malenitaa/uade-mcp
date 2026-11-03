// Calendario: un PDF del recorrido cuyo texto no se puede leer vuelve como imágenes de sus páginas
// (y sus links se siguen igual); la tool manda esas imágenes como contenido de imagen del MCP.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Calendario, TEXTO_ILEGIBLE } from '../src/sources/calendario/index.js';
import { fragmentos } from '../src/sources/docs/fragmentos.js';
import { registerCalendarioTools } from '../src/tools/calendario.js';

const fx = (p: string) => new Uint8Array(readFileSync(new URL(`./fixtures/calendario/${p}`, import.meta.url)));
afterEach(() => vi.unstubAllGlobals());
// La copia local cifrada no se toca desde los tests: el llavero y ~/.uade-mcp son reales.
vi.mock('../src/cache/cache.js', () => ({ TTL: { semana: 1 }, cache: { get: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => ({ value: await fn(), actualizado: '2026-11-03T00:00' }) } }));

describe('Calendario.documentos', () => {
  it('el PDF ilegible del índice vuelve con imágenes y se siguen sus links', async () => {
    vi.stubGlobal('fetch', async (u: URL) => new Response(u.href.includes('/help/') ? 'no es pdf' : fx('cronos_inscrip_previos.pdf'), { headers: { 'content-type': 'application/pdf' } }));
    const client = { get: async () => ({ url: new URL('https://dre.uade.edu.ar/cronogramasUADE.pdf'), bytes: fx('cronos_inscrip_previos.pdf') }) };
    const docs = await new Calendario(client as never).documentos('inscripciones');
    expect(docs).toHaveLength(1); // el único link del PDF va a help.uade.edu.ar, que no es un PDF de dre
    expect(docs[0]!.texto.startsWith(TEXTO_ILEGIBLE)).toBe(true);
    expect(docs[0]!.imagenes).toHaveLength(1);
    expect(docs[0]!.imagenes![0]!.mimeType).toBe('image/png');
  });
});

// Lista de cursos de verano como la deja el extractor (una fila por clase, sin saltos); materias inventadas.
const fila = (clase: string, codigo: string, materia: string, turno: string) =>
  `MONSERRAT ${clase} ${codigo} ${materia} ${turno} 25/01/2027 23/02/2027 08:15 - 12:15 Lunes - Martes - Miercoles - Jueves 03/03/2027`;
const LISTA_VERANO = ['Sede Clase Código Materia Turno Horario Desde Hasta Dias De Cursada Fecha final',
  fila('1030', '1.1.083', 'ADMINISTRACIÓN EMPRESARIAL I', 'MAÑANA'),
  fila('1057', '3.1.006', 'ÁLGEBRA Y GEOMETRÍA ANALÍTICA', 'MAÑANA'),
  fila('1114', '3.1.046', 'CÁLCULO I', 'MAÑANA'),
  fila('1248', '3.1.024', 'MATEMÁTICA DISCRETA', 'TARDE'),
  fila('1262', '1.2.003', 'INTRODUCCIÓN AL MARKETING', 'TARDE'),
].join(' ');

describe('fragmentos sobre una lista de cursos de verano', () => {
  it('trae la fila de cada materia buscada, sin tildes y con el horario alrededor', () => {
    const f = fragmentos(LISTA_VERANO, 'algebra calculo', 80);
    expect(f).toHaveLength(2);
    expect(f[0]).toContain('3.1.006 ÁLGEBRA Y GEOMETRÍA ANALÍTICA MAÑANA 25/01/2027');
    expect(f[1]).toContain('3.1.046 CÁLCULO I MAÑANA');
    expect(fragmentos(LISTA_VERANO, '3.1.024', 40)[0]).toContain('MATEMÁTICA DISCRETA TARDE');
    expect(fragmentos(LISTA_VERANO, 'programación')).toEqual([]);
  });
});

describe('uade_academic_calendar', () => {
  type Doc = { url: string; nombre: string; nivel: number; texto?: string; fragmentos?: string[] };
  const registrar = (docs: unknown[]) => {
    let handler: (args: { topic: string; filter?: string; query?: string }) => Promise<{ content: { type: string; text?: string; data?: string }[] }>;
    const fake = { registerTool: (_n: string, _c: unknown, h: typeof handler) => { handler = h; } } as unknown as McpServer;
    registerCalendarioTools(fake, new Set(['webcampus.leer']), { documentos: async () => docs } as unknown as Calendario);
    return handler!;
  };

  it('con query, cada documento legible trae solo fragmentos; el de imagen va igual; sin apariciones, solo nombre y link', async () => {
    const handler = registrar([
      { url: 'https://dre.uade.edu.ar/i.pdf', nombre: 'indice', nivel: 0, texto: `${TEXTO_ILEGIBLE}; va 1 imagen)`, imagenes: [{ mimeType: 'image/png', base64: 'AAAA' }] },
      { url: 'https://dre.uade.edu.ar/m.pdf', nombre: 'CV Monserrat', nivel: 2, texto: LISTA_VERANO },
      { url: 'https://dre.uade.edu.ar/c.pdf', nombre: 'condicionesmri', nivel: 2, texto: 'Condiciones para cursar MRI: tener aprobadas las correlativas.' },
    ]);
    const r = await handler({ topic: 'inscripciones', query: 'calculo' });
    const { consulta, documentos } = JSON.parse(r.content[0]!.text!) as { consulta: string; documentos: Doc[] };
    expect(consulta).toBe('calculo');
    expect(documentos[0]!.texto?.startsWith(TEXTO_ILEGIBLE)).toBe(true);
    expect(r.content[1]).toMatchObject({ type: 'image', data: 'AAAA' });
    expect(documentos[1]!.texto).toBeUndefined();
    expect(documentos[1]!.fragmentos).toHaveLength(1);
    expect(documentos[1]!.fragmentos![0]).toContain('CÁLCULO I MAÑANA');
    expect(documentos[2]).toEqual({ url: 'https://dre.uade.edu.ar/c.pdf', nombre: 'condicionesmri', nivel: 2 });
    // Sin query, el texto entero como siempre.
    const todo = JSON.parse((await handler({ topic: 'inscripciones' })).content[0]!.text!) as { consulta?: string; documentos: Doc[] };
    expect(todo.consulta).toBeUndefined();
    expect(todo.documentos[1]!.texto).toBe(LISTA_VERANO);
    expect(todo.documentos[2]!.texto).toContain('correlativas');
  });

  it('las imágenes de los documentos van como contenido de imagen, no dentro del JSON', async () => {
    let handler: (args: { topic: string; filter?: string }) => Promise<{ content: { type: string; text?: string; data?: string }[] }>;
    const fake = { registerTool: (_n: string, _c: unknown, h: typeof handler) => { handler = h; } } as unknown as McpServer;
    const cal = { documentos: async () => [
      { url: 'https://dre.uade.edu.ar/a.pdf', nombre: 'a', nivel: 0, texto: 'CRONOGRAMA DE INSCRIPCIONES' },
      { url: 'https://dre.uade.edu.ar/b.pdf', nombre: 'b', nivel: 1, texto: `${TEXTO_ILEGIBLE}; va 1 imagen)`, imagenes: [{ mimeType: 'image/png', base64: 'AAAA' }] },
    ] } as unknown as Calendario;
    registerCalendarioTools(fake, new Set(['webcampus.leer']), cal);
    const r = await handler!({ topic: 'inscripciones' });
    expect(r.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(r.content[1]).toMatchObject({ type: 'image', data: 'AAAA', mimeType: 'image/png' });
    expect(r.content[0]!.text).not.toContain('AAAA');
    expect(JSON.parse(r.content[0]!.text!).documentos).toHaveLength(2);
  });
});
