// uade_enrollment_guide: las imágenes de los avisos de Importante se bajan del mismo sitio (con tope de
// cantidad y de bytes) y van como contenido de imagen; [imagen N] marca dónde estaba cada una.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Inscripciones, parseGuia } from '../src/sources/inscripciones/index.js';
import { MAX_BYTES_IMAGEN } from '../src/sources/docs/leer.js';
import { imagenesDeAvisos, MAX_IMAGENES_AVISOS, registerInscripcionesTools } from '../src/tools/inscripciones.js';

vi.mock('../src/cache/cache.js', () => ({ TTL: { dia: 1, corto: 1 }, cache: { get: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => ({ value: await fn(), actualizado: '2026-11-07T00:00' }) } }));
const html = readFileSync(new URL('./fixtures/inscripciones/home.html', import.meta.url), 'utf8');
const png = new Uint8Array(readFileSync(new URL('./fixtures/webcampus/banner.png', import.meta.url)));

type Handler = (a: Record<string, unknown>) => Promise<{ content: { type: string; text?: string; data?: string }[] }>;
function registrar(get: (p: string) => Promise<unknown>): Handler {
  const handlers: Record<string, Handler> = {};
  const fake = { registerTool: (n: string, _c: unknown, h: Handler) => { handlers[n] = h; } } as unknown as McpServer;
  registerInscripcionesTools(fake, new Set(['pia.leer']), undefined, new Inscripciones({ get } as never));
  return handlers['uade_enrollment_guide']!;
}

describe('uade_enrollment_guide con imágenes', () => {
  it('manda las dos imágenes del aviso, en orden, y el aviso cortado queda con su marca', async () => {
    const get = vi.fn(async (p: string) => (p === '/' ? { html, bytes: new Uint8Array() } : { html: '', bytes: png }));
    const r = await registrar(get)({});
    expect(r.content.map((c) => c.type)).toEqual(['text', 'image', 'image']);
    expect(get).toHaveBeenCalledWith('/Content/images/grilla.png');
    const j = JSON.parse(r.content[0]!.text!) as { importante: string[]; imagenesDeAvisos: string };
    expect(j.importante[0]).toContain('identificada así: [imagen 2] Consultas');
    expect(j.imagenesDeAvisos).toContain('[imagen 1], [imagen 2]');
    expect(j).not.toHaveProperty('imagenesImportante');
  });

  it('con query, solo las imágenes de los avisos que coinciden', async () => {
    const get = vi.fn(async (p: string) => (p === '/' ? { html, bytes: new Uint8Array() } : { html: '', bytes: png }));
    const r = await registrar(get)({ query: 'notebook' });
    expect(r.content.map((c) => c.type)).toEqual(['text']);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('una imagen que falla o pesa de más queda como nota con el link; el texto sale igual', async () => {
    const get = vi.fn(async (p: string) => {
      if (p === '/') return { html, bytes: new Uint8Array() };
      if (p.includes('grilla')) throw new Error('timeout');
      return { html: '', bytes: new Uint8Array([...png, ...new Uint8Array(MAX_BYTES_IMAGEN)]) };
    });
    const r = await registrar(get)({});
    expect(r.content.map((c) => c.type)).toEqual(['text']);
    const j = JSON.parse(r.content[0]!.text!) as { notasDeImagenes: string[] };
    expect(j.notasDeImagenes).toEqual([
      expect.stringMatching(/^\[imagen 1\] pesa 1,5 MB \(tope 1,5 MB\): abrila vos en https:\/\/inscripciones\.uade\.edu\.ar\/Content/),
      expect.stringMatching(/^\[imagen 2\] no se pudo bajar \(timeout\)/),
    ]);
  });

  it('tope de cantidad; una imagen de otro sitio no se guarda ni se baja', async () => {
    const muchas = Array.from({ length: MAX_IMAGENES_AVISOS + 1 }, (_, i) => ({ n: i + 1, path: `/Content/${i}.png` }));
    const r = await imagenesDeAvisos(muchas, { imagen: async () => ({ mimeType: 'image/png', bytes: png }) });
    expect(r.imagenes).toHaveLength(MAX_IMAGENES_AVISOS);
    expect(r.notas).toEqual([expect.stringContaining(`tope de ${MAX_IMAGENES_AVISOS}`)]);
    const ajena = parseGuia(html.replace('src="/Content/images/grilla.png"', 'src="https://evil.example/x.png"'));
    expect(ajena.imagenesImportante).toEqual(['/Content/images/imagen%20mensaje-min.png']);
    await expect(new Inscripciones({ get: async () => ({ bytes: png }) } as never).imagen('https://evil.example/x.png')).rejects.toThrow();
  });
});
