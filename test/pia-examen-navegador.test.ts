// El recorrido por el PIA de exámenes previos (pia.uade.edu.ar) en un navegador real, contra un
// servidor local con fixtures sintéticas que anota cada POST: confirma antes de escribir, acepta el
// alert "Se ha agregado la clase al carrito", llega a "Terminos y Condiciones" (o a "Cálculo de
// Aranceles" si PIA saltea los términos) y no manda nada ahí.
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext } from 'playwright-core';
import { elegirNavegador } from '../src/net/browser.js';
import { llevarAFinalExamen } from '../src/sources/pia/navegador-examen.js';
import { parseArancelExamen, parseTerminosExamen } from '../src/sources/pia/parse.js';
import { PageChangedError } from '../src/sources/webcampus/parse.js';

const fx = (p: string) => readFileSync(new URL(`./fixtures/pia-examen/${p}`, import.meta.url), 'utf8');
const navegador = elegirNavegador();
const CODIGO_VALIDO = '9.9.131';

interface Post { path: string; body: URLSearchParams }
let server: Server;
let origen: string;
let ctx: BrowserContext | null = null;
const posts: Post[] = [];
let carritoVaA: 'terminos' | 'aranceles' = 'terminos';

function seleccionar(codigo: string, conNombre: boolean, conGrilla: boolean, alerta: boolean): string {
  return fx('seleccionar.html')
    .replace('{{CODIGO}}', codigo)
    .replace('{{NOMBRE}}', conNombre && codigo === CODIGO_VALIDO ? 'MATERIA FICTICIA PREVIO' : '')
    .replace('{{GRILLA}}', conGrilla && codigo === CODIGO_VALIDO ? fx('grilla.html') : '')
    .replace('{{SCRIPT}}', alerta ? '<script>alert("Se ha agregado la clase al carrito")</script>' : '');
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const path = req.url ?? '/';
      const html = (h: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(h); };
      if (req.method === 'GET') {
        if (/InscripcionAgregar\.aspx/i.test(path)) return html(fx('agregar.html'));
        if (/InscripcionExamenSeleccionarClase\.aspx/i.test(path)) return html(seleccionar('', false, false, false));
        if (/ArancelInscripcion\.aspx/i.test(path)) return html(fx('arancel.html'));
        if (/TerminosYCondicionesTexto\.aspx/i.test(path)) return html(fx('terminos.html'));
        res.writeHead(404); return res.end();
      }
      const body = new URLSearchParams(raw);
      posts.push({ path, body });
      const codigo = body.get('ctl00$ContentPlaceHolder1$pesMateria$TextBoxCodigo') ?? '';
      const tiene = (re: RegExp) => [...body.keys()].some((k) => re.test(k));
      if (/ArancelInscripcion\.aspx/i.test(path)) return html(fx('arancel.html'));
      if (/TerminosYCondicionesTexto\.aspx/i.test(path)) return html(fx('terminos.html'));
      if (tiene(/pesMateria\$ctl01$/)) return html(seleccionar(codigo, true, false, false));
      if (tiene(/\$btnBuscar$/)) return html(seleccionar(codigo, true, true, false));
      if (tiene(/\$btnAgregarCarrito(\.x)?$/)) return html(seleccionar(codigo, true, true, true));
      if (tiene(/\$btnConfirmarCarrito$/)) { res.writeHead(302, { location: carritoVaA === 'terminos' ? '/Pia/Vistas/Inscripcion/TerminosYCondicionesTexto.aspx?param=FICTICIO' : '/Pia/Vistas/Inscripcion/ArancelInscripcion.aspx?param=FICTICIO' }); return res.end(); }
      res.writeHead(400); res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  origen = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  if (navegador) ctx = await chromium.launchPersistentContext('', { executablePath: navegador.ruta, headless: true });
}, 60_000);
afterAll(async () => { await ctx?.close(); server.close(); });

const link = () => `${origen}/PIA/Vistas/Inscripcion/InscripcionAgregar.aspx?param=FICTICIO`;
const botones = () => posts.map((p) => [...p.body.keys()].find((k) => /\$(btn[A-Za-z]+|ctl01)(\.x)?$/.test(k))?.replace(/\.x$/, '').split('$').pop());

describe.skipIf(!navegador)('recorrido por el PIA de exámenes hasta términos y condiciones o aranceles', { timeout: 60_000 }, () => {
  it('resuelve la materia, busca, pide confirmación con la clase elegida, agrega, confirma el carrito y se detiene en términos y condiciones', async () => {
    posts.length = 0;
    carritoVaA = 'terminos';
    const page = await ctx!.newPage();
    let resumen = '';
    const r = await llevarAFinalExamen(page, link(), { codigo: CODIGO_VALIDO, clase: '21975' }, async (t) => { resumen = t; return true; }, origen);
    expect(resumen).toContain('clase 21975 · SEDE CENTRO · JUEVES 15:30 - 18:15 · examen 12/11/2031 · vacantes 56');
    expect(resumen).toContain('Continuar y Finalizar los apretás vos');
    expect(botones()).toEqual(['ctl01', 'btnBuscar', 'btnAgregarCarrito', 'btnConfirmarCarrito']);
    expect(posts[2]!.body.has('ctl00$ContentPlaceHolder1$grdClaseInscripcion$grdClaseInscripcion$ctl01$ctl04$btnAgregarCarrito.x')).toBe(true);
    expect(r.avisoPia).toBe('Se ha agregado la clase al carrito');
    expect(r.clase).toMatchObject({ sede: 'SEDE CENTRO', clase: '21975', vacantes: '56', fecha: '12/11/2031' });
    expect(r.pantalla).toBe('terminos');
    expect(r.terminos).toEqual({ texto: 'Paso 3: Te recordamos que tu inscripción no finaliza hasta que se indique que la misma ha concluido satisfactoriamente. El examen será sin cargo para rendir por primera vez cada asignatura ficticia. El arancel por examen vencerá al mes siguiente de la inscripción.', aceptado: false });
    expect(r.aranceles).toEqual([]);
    expect(r.puedeFinalizar).toBe(false);
    expect(page.url()).toMatch(/TerminosYCondicionesTexto\.aspx/);
    expect(await page.locator('input[type=checkbox]').isChecked()).toBe(false);
    expect(posts.some((p) => /TerminosYCondiciones|ArancelInscripcion/i.test(p.path))).toBe(false);
    expect(posts.some((p) => [...p.body.keys()].some((k) => /Continuar|Finalizar|chkAcepto/i.test(k)))).toBe(false);
    await page.close();
  });

  it('si PIA saltea los términos y va directo a aranceles, los lee y se detiene ahí', async () => {
    posts.length = 0;
    carritoVaA = 'aranceles';
    const page = await ctx!.newPage();
    const r = await llevarAFinalExamen(page, link(), { codigo: CODIGO_VALIDO, clase: '21975' }, async () => true, origen);
    expect(r.pantalla).toBe('aranceles');
    expect(r.terminos).toBeNull();
    expect(r.aranceles).toEqual([{ tipo: 'DERECHO A EXAMEN', periodo: '2031 2DO CUATR FICTICIO 03/08/2031 - 31/12/2031', planDeCuotas: 'EXAMEN PREVIO 2DO CUATR - FICTICIO' }]);
    expect(r.puedeFinalizar).toBe(true);
    expect(page.url()).toMatch(/ArancelInscripcion\.aspx/);
    expect(posts.some((p) => /ArancelInscripcion/i.test(p.path))).toBe(false);
    expect(posts.some((p) => [...p.body.keys()].some((k) => /Finalizar/i.test(k)))).toBe(false);
    carritoVaA = 'terminos';
    await page.close();
  });

  it('con varias clases y sin elegir una, lo dice; con la segunda elegida, va por esa', async () => {
    posts.length = 0;
    const page = await ctx!.newPage();
    await expect(llevarAFinalExamen(page, link(), { codigo: CODIGO_VALIDO }, async () => true, origen)).rejects.toThrow('hace falta elegir una (classNumber): clase 21975');
    expect(botones()).toEqual(['ctl01', 'btnBuscar']);
    posts.length = 0;
    const r = await llevarAFinalExamen(page, link(), { codigo: CODIGO_VALIDO, clase: '21980' }, async () => true, origen);
    expect(r.clase.sede).toBe('SEDE PLAYA');
    expect(posts[2]!.body.has('ctl00$ContentPlaceHolder1$grdClaseInscripcion$grdClaseInscripcion$ctl01$ctl05$btnAgregarCarrito.x')).toBe(true);
    await page.close();
  });

  it('si la persona no confirma, o la materia no tiene clases de examen, no se agrega nada', async () => {
    posts.length = 0;
    const page = await ctx!.newPage();
    await expect(llevarAFinalExamen(page, link(), { codigo: CODIGO_VALIDO, clase: '21975' }, async () => false, origen)).rejects.toThrow('No confirmaste');
    await expect(llevarAFinalExamen(page, link(), { codigo: '9.9.999' }, async () => true, origen)).rejects.toThrow('no muestra clases de examen para 9.9.999');
    await expect(llevarAFinalExamen(page, 'https://evil.example/PIA/Vistas/Inscripcion/InscripcionAgregar.aspx?param=x', { codigo: CODIGO_VALIDO }, async () => true, origen)).rejects.toThrow('no es de PIA');
    expect(posts.some((p) => [...p.body.keys()].some((k) => /btnAgregarCarrito|btnConfirmarCarrito|Finalizar/.test(k)))).toBe(false);
    await page.close();
  });
});

describe('parsers de "Terminos y Condiciones" y "Cálculo de Aranceles"', () => {
  it('términos: texto y estado de la tilde; sin tilde de aceptación, PageChangedError', () => {
    const r = parseTerminosExamen(fx('terminos.html'));
    expect(r.texto).toContain('El arancel por examen vencerá al mes siguiente de la inscripción.');
    expect(r.texto).not.toMatch(/acepto|Continuar|Cancelar/);
    expect(r.aceptado).toBe(false);
    expect(parseTerminosExamen(fx('terminos.html').replace('type="checkbox"', 'type="checkbox" checked')).aceptado).toBe(true);
    expect(() => parseTerminosExamen('<html><body><p>Hola</p><input type="checkbox" /></body></html>')).toThrow(PageChangedError);
  });
  it('tipo, período y plan de cuotas; sabe si el botón Finalizar está, sin tocarlo', () => {
    const r = parseArancelExamen(fx('arancel.html'));
    expect(r.aranceles[0]).toMatchObject({ tipo: 'DERECHO A EXAMEN', planDeCuotas: 'EXAMEN PREVIO 2DO CUATR - FICTICIO' });
    expect(r.puedeFinalizar).toBe(true);
    expect(() => parseArancelExamen('<html><body><table><tr><th>Otra cosa</th></tr></table></body></html>')).toThrow(PageChangedError);
  });
  it('navegador-examen.ts no nombra Finalizar como acción', () => {
    const src = readFileSync(new URL('../src/sources/pia/navegador-examen.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/btnFinalizar|CONTROLES\.finalizar/);
    expect(src).not.toMatch(/\.(click|check|fill|press)\([^)]*([Ff]inalizar|[Cc]ontinuar|checkbox|[Aa]cepto)/);
  });
});
