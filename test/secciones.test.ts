import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fragmentos } from '../src/sources/docs/fragmentos.js';
import { guiasEnlazadas, textoPagina } from '../src/sources/webcampus/secciones.js';
import { PageChangedError } from '../src/sources/webcampus/parse.js';

// La copia local cifrada no se toca desde los tests.
vi.mock('../src/cache/cache.js', () => ({ TTL: { semana: 1, dia: 1 }, cache: { get: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => ({ value: await fn(), actualizado: '2026-11-07T00:00' }) } }));

describe('secciones de WebCampus', () => {
  it('toma solo el contenido principal, sin menú ni scripts', () => {
    const html = '<div id="menu">Cuenta Corriente Becas</div><div id="ctl00_ContentPlaceHolderMain_pnl"><h3>Becas</h3><p>Requisitos de la beca</p><script>x()</script><div id="ctl00_ContentPlaceHolderMain_sub">Plazo hasta marzo</div></div>';
    expect(textoPagina(html)).toBe('Becas Requisitos de la beca Plazo hasta marzo');
    expect(() => textoPagina('<div>otra cosa</div>')).toThrow(PageChangedError);
  });

  it('devuelve fragmentos alrededor de la consulta, sin tildes', () => {
    const texto = 'x'.repeat(1000) + ' La inasistencia justificada requiere certificado médico. ' + 'y'.repeat(1000);
    const f = fragmentos(texto, 'inasistencia médico', 60);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('inasistencia justificada requiere certificado médico');
    expect(fragmentos(texto, 'aranceles')).toEqual([]);
  });
});

describe('guías enlazadas', () => {
  it('toma los PDF de /Docs/ de WebCampus y los públicos de dre.uade.edu.ar, solo del contenido (no del pie)', () => {
    const html = '<div id="ctl00_ContentPlaceHolderMain_p"><a href="https://www.webcampus.uade.edu.ar/Docs/Configuracion_WiFi_UADE_OSX.pdf">mac</a><a href="/Docs/Configuracion_WiFi_UADE_iOS.pdf">ios</a><a href="https://dre.uade.edu.ar/ayues.pdf">talleres</a><a href="https://evil.com/Docs/a.pdf">y</a><a href="mailto:x@uade.edu.ar">m</a></div><footer><a href="https://dre.uade.edu.ar/emergencia.pdf">pie</a></footer>';
    expect(guiasEnlazadas(html)).toEqual(['/Docs/Configuracion_WiFi_UADE_OSX.pdf', '/Docs/Configuracion_WiFi_UADE_iOS.pdf', 'https://dre.uade.edu.ar/ayues.pdf']);
  });
});

describe('documento más pesado que el tope', () => {
  it('devuelve el link a WebCampus con el texto fijo, sin tirar ni inventar contenido', async () => {
    const { Secciones, TEXTO_DOCUMENTO_PESADO } = await import('../src/sources/webcampus/secciones.js');
    const { PolicyError } = await import('../src/net/policy.js');
    const client = { get: async () => { throw new PolicyError('respuesta demasiado grande'); } };
    const s = new Secciones(client as never);
    const d = await s.consultar('housing');
    expect('texto' in d && d.texto).toBe(`${TEXTO_DOCUMENTO_PESADO} https://www.webcampus.uade.edu.ar/Principal.aspx?MenuItemId=200`);
    expect(d.fuente).toBe('https://www.webcampus.uade.edu.ar/Principal.aspx?MenuItemId=200');
    const otro = { get: async () => { throw new PolicyError('dirección fuera de WebCampus'); } };
    await expect(new Secciones(otro as never).consultar('housing')).rejects.toThrow('fuera de WebCampus');
  });
});

describe('PDFs sin texto legible en una sección', () => {
  const dibujado = async () => (await import('./pdf-minimo.js')).pdfMinimo('0 0 0 rg 20 20 160 40 re f');

  it('el PDF de la sección (como emergencias, dibujado) va como imagen de su página', async () => {
    const { Secciones } = await import('../src/sources/webcampus/secciones.js');
    const bytes = await dibujado();
    const client = { get: async () => ({ url: new URL('https://dre.uade.edu.ar/emergencia.pdf'), bytes, html: '' }) };
    const d = await new Secciones(client as never).consultar('emergencias');
    expect('texto' in d && d.texto).toMatch(/^\(PDF sin texto: es un dibujo o una foto; van 1 imagen/);
    expect(d.imagenes).toHaveLength(1);
  });

  it('una guía enlazada sin texto suma su imagen, y el texto largo de la página se sigue recortando', async () => {
    const { Secciones } = await import('../src/sources/webcampus/secciones.js');
    const bytes = await dibujado();
    const html = `<div id="ctl00_ContentPlaceHolderMain_pnl"><p>${'Reglamento del gimnasio. '.repeat(600)}</p><a href="/Docs/vestimenta.pdf">Vestimenta</a></div>`;
    const client = { get: async (p: string) => (p.startsWith('/Docs/') ? { url: new URL(p, 'https://www.webcampus.uade.edu.ar'), bytes, html: '' } : { url: new URL(p, 'https://www.webcampus.uade.edu.ar'), bytes: new TextEncoder().encode(html), html }) };
    const d = await new Secciones(client as never).consultar('deportes');
    expect(d.imagenes).toHaveLength(1);
    expect('recortado' in d && d.recortado).toBe(true);
    expect('texto' in d && d.texto.length).toBeLessThan(8300);
    expect('texto' in d && d.texto).toMatch(/\[Guía: vestimenta\.pdf\] \(PDF sin texto: es un dibujo o una foto; van 1 imagen de sus páginas para que las leas\)$/);
  });
});

describe('webcampus_section con query', () => {
  it('si la sección está en imágenes, van igual: lo que está en una imagen no se puede buscar como texto', async () => {
    const { registerSeccionesTools } = await import('../src/tools/secciones.js');
    let handler!: (a: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;
    const fake = { registerTool: (n: string, _c: unknown, h: typeof handler) => { if (n === 'webcampus_section') handler = h; } } as unknown as McpServer;
    const sec = { consultar: async () => ({ seccion: 'emergencias', fuente: 'https://dre.uade.edu.ar/emergencia.pdf', texto: '(PDF sin texto: es un dibujo o una foto; van 1 imagen de sus páginas para que las leas)', imagenes: [{ mimeType: 'image/png', base64: 'AAAA' }] }) };
    registerSeccionesTools(fake, new Set(['webcampus.leer']), sec as never, {} as never);
    const r = await handler({ section: 'emergencias', query: 'Belgrano' });
    expect(r.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(JSON.parse(r.content[0]!.text!).enImagenes).toContain('buscá "Belgrano" ahí');
  });
});
