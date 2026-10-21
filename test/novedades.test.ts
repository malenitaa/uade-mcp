// Home de WebCampus (banners, novedades, agenda), una novedad con adjuntos y la lectura de links.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fechaAgenda, parseEvento, parseEventos, parseHome, parseNovedad } from '../src/sources/webcampus/novedades.js';
import { leerBytes, leerLink } from '../src/tools/novedades.js';
import type { WebCampus } from '../src/sources/webcampus/index.js';
import type { SharePointClient } from '../src/sources/sharepoint/index.js';

const fx = (p: string) => readFileSync(new URL(`./fixtures/webcampus/${p}`, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('home', () => {
  const h = parseHome(fx('home.html'), new Date('2030-10-19'));
  it('banners con título y link (los "#" quedan sin link)', () => {
    expect(h.banners).toEqual([
      { titulo: 'Campaña ficticia', link: 'https://comunicacion.short.gy/AAAAAA' },
      { titulo: 'Reservas Parking', link: 'https://parking.uade.edu.ar/' },
      { titulo: 'Feriado ficticio', link: null },
      { titulo: 'Horarios ficticios', link: 'https://dre.uade.edu.ar/ficticio.pdf' },
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
    expect((await leerLink('https://dre.uade.edu.ar/nota.txt', deps)).texto).toBe('hola pdf');
    expect((await leerLink('https://www.webcampus.uade.edu.ar/DocsDownload/Novedades/1.txt', deps)).texto).toBe('adjunto');
  });

  it('leerBytes adivina por los primeros bytes cuando el nombre no dice el tipo', async () => {
    expect(await leerBytes('cualquiera', new TextEncoder().encode('texto plano'))).toBe('texto plano');
  });
});
