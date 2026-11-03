// Calendario: un PDF del recorrido cuyo texto no se puede leer vuelve como imágenes de sus páginas
// (y sus links se siguen igual); la tool manda esas imágenes como contenido de imagen del MCP.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Calendario, TEXTO_ILEGIBLE } from '../src/sources/calendario/index.js';
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

describe('uade_academic_calendar', () => {
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
