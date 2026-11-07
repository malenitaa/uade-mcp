// Home de WebCampus (banners, novedades, agenda), una novedad con adjuntos y la lectura de links.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fechaAgenda, parseEvento, parseEventos, parseHome, parseNovedad } from '../src/sources/webcampus/novedades.js';
import { bannersConImagenes, leerBytesOImagenes, leerLink, MAX_BANNERS, MAX_BYTES_BANNER } from '../src/tools/novedades.js';
import { WebCampus } from '../src/sources/webcampus/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNovedadesTools } from '../src/tools/novedades.js';
import type { WebCampusClient } from '../src/sources/webcampus/client.js';
import type { Banner } from '../src/sources/webcampus/novedades.js';
import type { SharePointClient } from '../src/sources/sharepoint/index.js';
import { pdfMinimo } from './pdf-minimo.js';

vi.mock('../src/cache/cache.js', () => ({ TTL: { corto: 1, dia: 1 }, cache: { get: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => ({ value: await fn(), actualizado: '2026-11-05T00:00' }) } }));
const fx = (p: string) => readFileSync(new URL(`./fixtures/webcampus/${p}`, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('home', () => {
  const h = parseHome(fx('home.html'), new Date('2030-10-19'));
  it('banners con título y link (los "#" quedan sin link)', () => {
    const img = (f: string) => `https://www.webcampus.uade.edu.ar/ImgPublicidad/${f}`;
    expect(h.banners).toEqual([
      { titulo: 'Campaña ficticia', link: 'https://comunicacion.short.gy/AAAAAA', imagen: img('a.png') },
      { titulo: 'Reservas Parking', link: 'https://parking.uade.edu.ar/', imagen: img('p.jpg') },
      { titulo: 'Feriado ficticio', link: null, imagen: img('f.jpg') },
      // Sin texto alternativo: el aviso está solo en la imagen; no se descarta.
      { titulo: null, link: null, imagen: img('cierre.png') },
      // Imagen fuera de WebCampus: no se baja.
      { titulo: 'Imagen de afuera', link: null, imagen: null },
      { titulo: 'Horarios ficticios', link: 'https://dre.uade.edu.ar/ficticio.pdf', imagen: img('h.png') },
    ]);
  });
  it('novedades sin repetir ni "VER MÁS", con resumen; agenda con fecha ISO y hora', () => {
    expect(h.novedades).toEqual([
      { id: '1001', titulo: 'Novedad ficticia uno', resumen: 'Resumen de la novedad uno.' },
      { id: '1002', titulo: 'Novedad ficticia dos', resumen: null },
    ]);
    expect(h.agenda).toEqual([{ categoria: 'Charlas', titulo: 'Charla ficticia (19/10)', fecha: '2030-10-19', hora: 'de 14:00 a 17:00', id: '777' }]);
    expect(fechaAgenda('5', 'Enero', new Date('2030-12-20'))).toBe('2031-01-05');
  });
  it('una novedad: título, texto y solo los adjuntos/documentos', () => {
    expect(parseNovedad(fx('novedad.html'), '1001')).toEqual({
      id: '1001', titulo: 'Novedad ficticia uno', texto: 'Novedad ficticia uno Texto completo de la novedad ficticia, con detalle. Adjunto Guía otra página',
      adjuntos: ['/DocsDownload/Novedades/1001_1_adjunto.xlsx', 'https://dre.uade.edu.ar/guia.pdf'],
    });
  });
});

describe('banners como imagen', () => {
  const png = readFileSync(new URL('./fixtures/webcampus/banner.png', import.meta.url));

  it('WebCampus.imagenBanner: baja por el cliente con sesión, detecta el tipo y rechaza lo que no es imagen u otro host', async () => {
    const get = vi.fn(async (p: string) => ({ bytes: p.endsWith('.png') ? new Uint8Array(png) : new TextEncoder().encode('<html>'), html: '', url: new URL(p, 'https://www.webcampus.uade.edu.ar') }));
    const wc = new WebCampus({ get } as unknown as WebCampusClient);
    expect((await wc.imagenBanner('https://www.webcampus.uade.edu.ar/ImgPublicidad/cierre.png')).mimeType).toBe('image/png');
    expect(get).toHaveBeenCalledWith('/ImgPublicidad/cierre.png');
    await expect(wc.imagenBanner('https://www.webcampus.uade.edu.ar/ImgPublicidad/x.aspx')).rejects.toThrow('no devolvió una imagen');
    await expect(wc.imagenBanner('https://otro.example.com/x.png')).rejects.toThrow('Solo se bajan');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('en el orden del carrusel, con tope de cantidad y de bytes; si una falla, las demás salen igual', async () => {
    const h = parseHome(fx('home.html'), new Date('2030-10-19'));
    const b64 = png.toString('base64');
    const bajar = vi.fn(async (url: string) => {
      if (url.endsWith('p.jpg')) throw new Error('timeout');
      if (url.endsWith('f.jpg')) return { tamanio: MAX_BYTES_BANNER + 1 };
      return { tamanio: png.length, mimeType: 'image/png', base64: b64 };
    });
    const r = await bannersConImagenes(h.banners, bajar);
    expect(r.imagenes).toEqual([{ mimeType: 'image/png', base64: b64 }, { mimeType: 'image/png', base64: b64 }, { mimeType: 'image/png', base64: b64 }]);
    expect(r.banners).toEqual([
      { titulo: 'Campaña ficticia', link: 'https://comunicacion.short.gy/AAAAAA', verImagen: 1 },
      { titulo: 'Reservas Parking', link: 'https://parking.uade.edu.ar/', imagenUrl: expect.stringContaining('p.jpg'), nota: 'No pude bajar la imagen: timeout' },
      { titulo: 'Feriado ficticio', link: null, imagenUrl: expect.stringContaining('f.jpg'), nota: expect.stringContaining('tope 1,5 MB') },
      { titulo: null, link: null, verImagen: 2 },
      { titulo: 'Imagen de afuera', link: null },
      { titulo: 'Horarios ficticios', link: 'https://dre.uade.edu.ar/ficticio.pdf', verImagen: 3 },
    ]);

    const muchos: Banner[] = Array.from({ length: MAX_BANNERS + 2 }, (_, i) => ({ titulo: null, link: null, imagen: `https://www.webcampus.uade.edu.ar/ImgPublicidad/${i}.png` }));
    const t = await bannersConImagenes(muchos, async () => ({ tamanio: 1, mimeType: 'image/png', base64: 'x' }));
    expect(t.imagenes).toHaveLength(MAX_BANNERS);
    expect(t.banners.at(-1)).toMatchObject({ nota: expect.stringContaining(`tope de ${MAX_BANNERS}`) });
  });
});

describe('webcampus_news sin argumentos', () => {
  const png = new Uint8Array(readFileSync(new URL('./fixtures/webcampus/banner.png', import.meta.url)));
  const registrar = (get: (p: string) => Promise<unknown>) => {
    let handler: (a: Record<string, unknown>) => Promise<{ content: { type: string; text?: string; data?: string; mimeType?: string }[] }>;
    const fake = { registerTool: (_n: string, _c: unknown, h: typeof handler) => { handler = h; } } as unknown as McpServer;
    registerNovedadesTools(fake, new Set(['webcampus.leer']), new WebCampus({ get } as unknown as WebCampusClient));
    return handler!;
  };

  it('devuelve el JSON y las imágenes de los banners como contenido de imagen, en orden', async () => {
    const handler = registrar(async (p) => (p === '/HomeWC.aspx' ? { html: fx('home.html'), bytes: new Uint8Array() } : { html: '', bytes: png }));
    const r = await handler({ allEvents: false });
    expect(r.content.map((c) => c.type)).toEqual(['text', 'image', 'image', 'image', 'image', 'image']);
    expect(r.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: Buffer.from(png).toString('base64') });
    const j = JSON.parse(r.content[0]!.text!) as { banners: { verImagen?: number }[]; imagenesDeBanners: string };
    expect(j.banners.map((b) => b.verImagen ?? null)).toEqual([1, 2, 3, 4, null, 5]);
    expect(j.imagenesDeBanners).toContain('cierres de la universidad');
  });

  it('newsId: un adjunto sin texto legible manda sus imágenes y dice cuáles son', async () => {
    const handler = registrar(async (p) => {
      if (p.startsWith('/MiContenido/Novedades')) return { html: fx('novedad.html'), bytes: new Uint8Array() };
      return { html: '', bytes: new Uint8Array(), url: new URL(p, 'https://www.webcampus.uade.edu.ar') };
    });
    vi.stubGlobal('fetch', async () => new Response(pdfMinimo('0 0 0 rg 20 20 160 40 re f'), { headers: { 'content-type': 'application/pdf' } }));
    const r = await handler({ newsId: '1001', allEvents: false });
    expect(r.content.map((c) => c.type)).toEqual(['text', 'image']);
    const j = JSON.parse(r.content[0]!.text!) as { adjuntos: { nombre: string; verImagenes?: string }[] };
    expect(j.adjuntos.find((a) => a.nombre === 'guia.pdf')).toMatchObject({ verImagenes: '1' });
  });

  it('si no se puede bajar ninguna imagen, el JSON sale igual con una nota', async () => {
    const handler = registrar(async (p) => {
      if (p === '/HomeWC.aspx') return { html: fx('home.html'), bytes: new Uint8Array() };
      throw new Error('WebCampus no respondió');
    });
    const r = await handler({ allEvents: false });
    expect(r.content.map((c) => c.type)).toEqual(['text']);
    const j = JSON.parse(r.content[0]!.text!) as { banners: { nota?: string }[]; imagenesDeBanners: string; novedades: unknown[] };
    expect(j.imagenesDeBanners).toContain('No pude bajar ninguna imagen');
    expect(j.banners[0]!.nota).toContain('WebCampus no respondió');
    expect(j.novedades).toHaveLength(2);
  });
});

describe('agenda completa y detalle de evento', () => {
  it('eventos con categoría, fecha ISO, hora e id', () => {
    expect(parseEventos(fx('eventos.html'), new Date('2030-10-19'))).toEqual([
      { categoria: 'Charlas', titulo: 'Charla ficticia (19/10)', fecha: '2030-10-19', hora: 'De 14:00 a 17:00', id: '777' },
      { categoria: 'Talleres', titulo: 'Taller ficticio', fecha: '2030-11-02', hora: 'De 09:00 a 18:00', id: '778' },
    ]);
  });
  it('un evento: quién organiza, fecha, hora, lugar y texto (sin la lista de "más eventos")', () => {
    expect(parseEvento(fx('agenda.html'), '777')).toEqual({
      id: '777', titulo: 'Charla ficticia (19/10)', organiza: 'Facultad Ficticia (Charlas)', fechaTexto: 'Sabado 19 de octubre', hora: 'De 14:00 a 17:00', lugar: 'Sede Ficticia',
      texto: 'Descripción ficticia de la charla. Escribí a ficticio@uade.edu.ar para coordinar.',
    });
  });
});

describe('leer links', () => {
  const deps = { wc: { archivo: vi.fn(async () => ({ nombre: 'x.txt', bytes: new TextEncoder().encode('adjunto') })) } as unknown as WebCampus, sp: { descargarCompartido: vi.fn(async () => ({ nombre: 'sin-extension', bytes: new TextEncoder().encode('%PDF-no') })) } as unknown as SharePointClient };

  it('sitio fuera del MCP: devuelve el link y lo dice, sin pedir nada', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await leerLink('https://parking.uade.edu.ar/', deps)).toEqual({ url: 'https://parking.uade.edu.ar/', nota: 'Es un sitio fuera del MCP: abrilo vos en el navegador.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('acortador de UADE → sigue la redirección sin cookies; si termina afuera, devuelve la URL final', async () => {
    const calls: { url: string; cookie: string | null }[] = [];
    vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
      calls.push({ url: new URL(input).href, cookie: new Headers(init.headers).get('cookie') });
      return new URL(input).hostname === 'comunicacion.short.gy' ? new Response(null, { status: 302, headers: { location: 'https://forms.gle/x' } }) : new Response('x');
    });
    expect(await leerLink('https://comunicacion.short.gy/abc', deps)).toMatchObject({ url: 'https://forms.gle/x', nota: expect.stringContaining('fuera del MCP') });
    expect(calls).toEqual([{ url: 'https://comunicacion.short.gy/abc', cookie: null }]);
  });

  it('PDF de dre.uade.edu.ar: lo lee; adjunto de WebCampus: por el cliente con sesión', async () => {
    vi.stubGlobal('fetch', async () => new Response(new TextEncoder().encode('hola pdf'), { headers: { 'content-type': 'text/plain' } }));
    expect((await leerLink('https://dre.uade.edu.ar/nota.txt', deps)).texto).toContain('hola pdf');
    expect((await leerLink('https://www.webcampus.uade.edu.ar/DocsDownload/Novedades/1.txt', deps)).texto).toContain('adjunto');
  });

  it('PDF de dre sin texto (dibujado, como el de requisitos de promociones): llega como imagen de la página, no como "escaneado"', async () => {
    vi.stubGlobal('fetch', async () => new Response(pdfMinimo('0 0 0 rg 20 20 160 40 re f'), { headers: { 'content-type': 'application/pdf' } }));
    const r = await leerLink('https://www.dre.uade.edu.ar/Requisitos%20ficticios.pdf', deps);
    expect(r.texto).toMatch(/^\(PDF sin texto: está dibujado; van 1 imagen de sus páginas/);
    expect(r.imagenes).toHaveLength(1);
  });

  it('PDF que no se puede dibujar (sale en blanco): no manda nada vacío; dice que hay que abrir el link', async () => {
    vi.stubGlobal('fetch', async () => new Response(pdfMinimo(''), { headers: { 'content-type': 'application/pdf' } }));
    const r = await leerLink('https://dre.uade.edu.ar/vacio.pdf', deps);
    expect(r).toEqual({ url: 'https://dre.uade.edu.ar/vacio.pdf', texto: expect.stringContaining('abrilo vos en el link') });
  });

  it('link a una imagen: va como imagen', async () => {
    const png = new Uint8Array(readFileSync(new URL('./fixtures/webcampus/banner.png', import.meta.url)));
    vi.stubGlobal('fetch', async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
    expect((await leerLink('https://dre.uade.edu.ar/aviso.png', deps)).imagenes).toHaveLength(1);
  });

  it('leerBytesOImagenes adivina por los primeros bytes cuando el nombre no dice el tipo', async () => {
    const { texto: t } = await leerBytesOImagenes('cualquiera', new TextEncoder().encode('texto plano'));
    expect(t).toContain('texto plano');
    expect(t).toMatch(/^<contenido_externo origen="cualquiera">/); // texto de terceros, marcado
  });
});
