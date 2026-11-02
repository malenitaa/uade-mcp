// El recorrido por PIA en un navegador real, contra un servidor local que sirve las fixtures
// sintéticas y anota cada POST. Lo que importa: pide confirmación antes de escribir, con las
// condiciones de la clase; llega a la pantalla final; y jamás manda btnFinalizar ni marca los términos.
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext } from 'playwright-core';
import { elegirNavegador } from '../src/net/browser.js';
import { llevarAFinalizar } from '../src/sources/pia/navegador.js';
import { CONTROLES } from '../src/sources/pia/parse.js';

const fx = (p: string) => readFileSync(new URL(`./fixtures/pia/${p}`, import.meta.url), 'utf8');
const navegador = elegirNavegador();

interface Post { path: string; body: URLSearchParams }
let server: Server;
let origen: string;
let ctx: BrowserContext | null = null;
const posts: Post[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const path = req.url ?? '/';
      const html = (f: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fx(f)); };
      if (req.method === 'GET') {
        if (path.startsWith('/InscripcionClaseBuscar.aspx')) return html('buscar.html');
        if (path.startsWith('/InscripcionFinalizar.aspx')) return html('finalizar-dos.html');
        res.writeHead(404); return res.end();
      }
      const body = new URLSearchParams(raw);
      posts.push({ path, body });
      const tiene = (name: string) => [...body.keys()].some((k) => k === name || k.startsWith(`${name}.`));
      if (path.startsWith('/InscripcionFinalizar.aspx')) return html('finalizar-dos.html');
      if (tiene(CONTROLES.seleccionarMaterias)) return html('materias.html');
      if (tiene(CONTROLES.buscar)) return html('clases.html');
      if ([...body.keys()].some((k) => /\$btnCarritoAlta(\.x)?$/.test(k))) return html('clases-carrito.html');
      if (tiene(CONTROLES.confirmarCarrito)) { res.writeHead(302, { location: '/InscripcionFinalizar.aspx?param=FICTICIO' }); return res.end(); }
      res.writeHead(400); res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  origen = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  if (navegador) ctx = await chromium.launchPersistentContext('', { executablePath: navegador.ruta, headless: true });
}, 60_000);
afterAll(async () => { await ctx?.close(); server.close(); });

const link = () => `${origen}/InscripcionClaseBuscar.aspx?param=FICTICIO`;

describe.skipIf(!navegador)('recorrido por PIA hasta la pantalla final', { timeout: 60_000 }, () => {
  it('pide confirmación con las condiciones de la clase, agrega al carrito, confirma y se detiene en Finalizar', async () => {
    posts.length = 0;
    const page = await ctx!.newPage();
    let resumen = '';
    const final = await llevarAFinalizar(page, link(), { codigo: '9.9.102', clase: '1616', turno: 'intensivo' }, async (r) => { resumen = r; return true; }, origen);
    expect(resumen).toContain('clase 1616 de 9.9.102');
    expect(resumen).toContain('vacantes: 18');
    expect(resumen).toContain('retención de las cuotas');
    expect(resumen).toContain('Finalizar los apretás vos');
    // Lo que se mandó, en orden: elegir materias → buscar (con la materia y el turno) → alta → confirmar carrito.
    const nombres = posts.map((p) => [...p.body.keys()].find((k) => /\$btn[A-Za-z]+(\.x)?$/.test(k))?.replace(/\.x$/, ''));
    expect(nombres).toEqual([CONTROLES.seleccionarMaterias, CONTROLES.buscar, 'ctl00$ContentPlaceHolder1$rptMateriaClases$ctl00$grdClases$grdResultados$ctl02$btnCarritoAlta', CONTROLES.confirmarCarrito]);
    expect(posts[1]!.body.get('ctl00$ContentPlaceHolder1$ucMateriaInscripcionBuscador$rptMaterias$ctl01$grdMaterias$ctl02$chkSeleccionar')).toBe('on');
    expect(posts[1]!.body.get(CONTROLES.turno)).toBe('10155');
    // La pantalla final, leída: dos clases en el carrito y tres aranceles.
    expect(final.pendientes.map((p) => p.clase)).toEqual(['1616', '2020']);
    expect(final.aranceles.map((a) => a.importe)).toEqual([185065, 370131, 120000]);
    expect(final.puedeFinalizar).toBe(true);
    expect(page.url()).toContain('/InscripcionFinalizar.aspx');
    // Nada más se tocó: ni términos ni Finalizar, ni se mandó nada a esa pantalla.
    expect(await page.locator(`input[name="${CONTROLES.terminos}"]`).isChecked()).toBe(false);
    expect(posts.some((p) => p.path.startsWith('/InscripcionFinalizar.aspx'))).toBe(false);
    expect(posts.some((p) => [...p.body.keys()].some((k) => k.includes('btnFinalizar') || k === CONTROLES.terminos))).toBe(false);
    await page.close();
  });

  it('si la persona no confirma, no se agrega nada al carrito', async () => {
    posts.length = 0;
    const page = await ctx!.newPage();
    await expect(llevarAFinalizar(page, link(), { codigo: '9.9.102', clase: '1616', turno: 'intensivo' }, async () => false, origen)).rejects.toThrow('No confirmaste');
    expect(posts.map((p) => [...p.body.keys()].find((k) => /\$btn/.test(k)))).toEqual([CONTROLES.seleccionarMaterias, CONTROLES.buscar]);
    expect(posts.some((p) => [...p.body.keys()].some((k) => /btnCarritoAlta|btnConfirmarCarrito|btnFinalizar/.test(k)))).toBe(false);
    await page.close();
  });

  it('materia no habilitada, clase inexistente o turno ambiguo: lo dice y no escribe', async () => {
    posts.length = 0;
    const page = await ctx!.newPage();
    await expect(llevarAFinalizar(page, link(), { codigo: '9.9.101', clase: '1616', turno: 'intensivo' }, async () => true, origen)).rejects.toThrow('no habilita 9.9.101');
    await expect(llevarAFinalizar(page, link(), { codigo: '9.9.102', clase: '1616' }, async () => true, origen)).rejects.toThrow('INTENSIVO, NOCHE');
    await expect(llevarAFinalizar(page, link(), { codigo: '9.9.102', clase: '9999', turno: 'noche' }, async () => true, origen)).rejects.toThrow('Clases que muestra: 1616, 2020');
    await expect(llevarAFinalizar(page, 'https://evil.example/InscripcionClaseBuscar.aspx?param=x', { codigo: '9.9.102', clase: '1616' }, async () => true, origen)).rejects.toThrow('no es de PIA');
    expect(posts.some((p) => [...p.body.keys()].some((k) => /btnCarritoAlta|btnConfirmarCarrito|btnFinalizar/.test(k)))).toBe(false);
    await page.close();
  });
});

describe('el código nunca aprieta Finalizar ni marca los términos', () => {
  it('navegador.ts no nombra btnFinalizar ni CONTROLES.finalizar, y a CONTROLES.terminos solo lo espera', () => {
    const src = readFileSync(new URL('../src/sources/pia/navegador.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/btnFinalizar|CONTROLES\.finalizar/);
    const usosTerminos = src.match(/CONTROLES\.terminos[^\n]*/g) ?? [];
    expect(usosTerminos.length).toBeGreaterThan(0);
    for (const u of usosTerminos) expect(u).toMatch(/\.waitFor\(/);
    expect(src).not.toMatch(/\.(check|click|fill|press)\([^)]*terminos/i);
  });
  it('CONTROLES.finalizar solo se usa en el parser, para saber si el botón está', () => {
    const archivos = ['src/sources/pia/index.ts', 'src/sources/pia/alta.ts', 'src/sources/pia/navegador.ts', 'src/tools/pia.ts', 'src/auth/login.ts'];
    for (const f of archivos) expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), f).not.toMatch(/CONTROLES\.finalizar|btnFinalizar/);
    const parse = readFileSync(new URL('../src/sources/pia/parse.ts', import.meta.url), 'utf8');
    expect(parse.match(/CONTROLES\.finalizar/g)?.length).toBe(1);
    expect(parse).toMatch(/puedeFinalizar: \$\(`input\[name="\$\{CONTROLES\.finalizar\}"\]`\)\.length > 0/);
  });
});
