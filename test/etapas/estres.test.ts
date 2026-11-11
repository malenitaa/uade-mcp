// Estrés: muchas llamadas a la vez por el protocolo MCP contra la UADE simulada. Responde: ¿se
// mezclan respuestas entre llamadas?, ¿la copia local cifrada queda sana?, ¿una fuente que falla o
// tarda arrastra a las demás?, ¿una página o un PDF de varios MB se bancan sin romper nada?
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pdfMinimo } from '../pdf-minimo.js';
import { levantar, WC, type Simulada } from './uade-simulada.js';

vi.mock('@napi-rs/keyring', async () => (await import('./uade-simulada.js')).llaveroSimulado);

const EN_PARALELO = 50;
const MB = 1024 * 1024;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Equipo docente inventado y distinto por aula: si dos respuestas se cruzan, se nota en el nombre.
const integrantes = (id: string) =>
  `<table id="tableintegrantes"><thead><tr><th>Foto</th><th>Nombre</th><th>Email</th><th>Legajo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>` +
  `<tr><td></td><td>Docente ${id}</td><td>docente${id}@example.edu.ar</td><td>1</td><td>Docente</td><td>1</td></tr></tbody></table>`;

// Aulas con comportamiento especial; el resto contesta bien, con una demora chica y desigual.
const SIN_RED = '700001', ERROR_500 = '700002', LENTA = '700003';
const DEMORA_LENTA = 600;
// Documentos grandes, a pedido de cada test (el tope de descarga del MCP es 10 MB).
let paginaBecas: string | null = null;
let pdfPrograma: Uint8Array | null = null;

let s: Simulada;
beforeAll(async () => {
  s = await levantar(async (u) => {
    if (u.origin !== WC) return undefined;
    if (u.pathname === '/Integrantes/Integrantes.aspx') {
      const id = u.searchParams.get('IdAula')!;
      if (id === SIN_RED) throw new TypeError('fetch failed');
      if (id === ERROR_500) return new Response('error', { status: 500 });
      await espera(id === LENTA ? DEMORA_LENTA : (Number(id) * 7) % 23);
      return new Response(integrantes(id));
    }
    if (paginaBecas && u.pathname === '/Principal.aspx') return new Response(paginaBecas);
    if (pdfPrograma && u.pathname.startsWith('/Programas/')) return new Response(pdfPrograma);
    return undefined;
  });
});
afterAll(() => s.cerrar());

const sinHora = ({ actualizado: _a, ...resto }: Record<string, unknown>) => resto;

describe('estrés: llamadas en paralelo', () => {
  const ids = Array.from({ length: EN_PARALELO }, (_, i) => String(800000 + i));

  it(`${EN_PARALELO} llamadas a la misma tool con argumentos distintos: cada una recibe lo suyo`, async () => {
    const rs = await Promise.all(ids.map((id) => s.llamar('webcampus_teachers', { idAula: id })));
    rs.forEach((r, i) => {
      expect(r.isError, ids[i]).toBe(false);
      expect(r.data.docentes).toEqual([{ nombre: `Docente ${ids[i]}`, email: `docente${ids[i]}@example.edu.ar` }]);
    });
  });

  it('la copia local cifrada queda sana: se descifra desde el disco y tiene las 50 entradas', async () => {
    // Una caché nueva sobre el mismo archivo: lo que lee es lo que quedó escrito, no la memoria del servidor.
    const { Cache, TTL } = await import('../../src/cache/cache.js');
    const delDisco = new Cache();
    for (const id of ids) {
      const r = await delDisco.get(`docentes:${id}`, TTL.dia, async () => { throw new Error('no estaba en el archivo'); });
      expect(r.value).toEqual([{ nombre: `Docente ${id}`, email: `docente${id}@example.edu.ar` }]);
    }
    // Y la segunda tanda sale entera de la copia: ni un pedido a UADE.
    const antes = s.pedidos.length;
    const rs = await Promise.all(ids.map((id) => s.llamar('webcampus_teachers', { idAula: id })));
    expect(s.pedidos.length).toBe(antes);
    rs.forEach((r, i) => expect(r.data.docentes[0].nombre).toBe(`Docente ${ids[i]}`));
  });

  it(`${EN_PARALELO} llamadas mezclando tools: lo mismo que de a una`, async () => {
    const casos: [string, Record<string, unknown>][] = [
      ['webcampus_terms', {}], ['webcampus_current_courses', {}], ['webcampus_attendance', { idAula: '900001' }], ['webcampus_transcript', {}],
      ['webcampus_account_balance', {}], ['webcampus_course_calendar', {}], ['uade_enrollment_windows', {}], ['uade_eligible_subjects', {}],
      ['webcampus_course_program', { subject: '3.1.024', query: 'bibliografía' }], ['webcampus_news', {}],
    ];
    const deAUna: string[] = [];
    for (const [n, a] of casos) deAUna.push(JSON.stringify(sinHora((await s.llamar(n, a)).data)));
    await s.llamar('uade_refresh', { topic: 'todo' }); // en frío: todas van a buscar a UADE a la vez
    const tanda = Array.from({ length: EN_PARALELO }, (_, i) => i % casos.length);
    const rs = await Promise.all(tanda.map((c) => s.llamar(casos[c]![0], casos[c]![1])));
    rs.forEach((r, i) => {
      expect(r.isError, casos[tanda[i]!]![0]).toBe(false);
      expect(JSON.stringify(sinHora(r.data)), casos[tanda[i]!]![0]).toBe(deAUna[tanda[i]!]);
    });
  });
});

describe('estrés: una fuente que falla o tarda', () => {
  it('no tumba al resto: las demás responden bien y antes que la lenta', async () => {
    const sanas = Array.from({ length: 20 }, (_, i) => String(810000 + i));
    const orden: string[] = [];
    const llamar = (id: string) => s.llamar('webcampus_teachers', { idAula: id }).then((r) => { orden.push(id); return r; });
    const [sinRed, error500, lenta, ...rs] = await Promise.all([SIN_RED, ERROR_500, LENTA, ...sanas].map(llamar));
    expect(sinRed!.isError).toBe(true);
    expect(error500!.isError).toBe(true);
    expect(error500!.texto).toBe('WebCampus respondió 500');
    expect(lenta!.data.docentes[0].nombre).toBe(`Docente ${LENTA}`);
    rs.forEach((r, i) => expect(r.data.docentes[0].nombre).toBe(`Docente ${sanas[i]}`));
    expect(orden.at(-1)).toBe(LENTA); // nadie esperó a la lenta
    // Un error no se guarda como dato: al volver la fuente no hay nada viejo que servir.
    expect((await s.llamar('webcampus_teachers', { idAula: SIN_RED })).isError).toBe(true);
    expect((await s.llamar('webcampus_terms')).isError).toBe(false);
  });
});

describe('estrés: entradas grandes (dentro del tope de 10 MB por descarga)', () => {
  it('una página HTML de 5 MB: se lee, se recorta y la respuesta al agente sigue siendo chica', async () => {
    paginaBecas = `<html><body><div id="ctl00_ContentPlaceHolderMain_pnl"><h3>Becas ficticias</h3>${'<p>Requisito ficticio de la beca, renglón de relleno.</p>'.repeat(Math.ceil((5 * MB) / 55))}</div></body></html>`;
    expect(paginaBecas.length).toBeGreaterThan(5 * MB);
    const [r, ...otras] = await Promise.all([s.llamar('webcampus_section', { section: 'becas' }), ...['820001', '820002', '820003'].map((id) => s.llamar('webcampus_teachers', { idAula: id }))]);
    expect(r!.isError).toBe(false);
    expect(r!.data.texto).toMatch(/^Becas ficticias Requisito ficticio/);
    expect(r!.data.recortado).toBe(true);
    expect(r!.texto.length).toBeLessThan(20_000);
    otras.forEach((o) => expect(o.isError).toBe(false));
  });

  it('un PDF de 4 MB: se abre y se responde sin mandar megas al agente', async () => {
    // Una página con un dibujo y 4 MB de comentarios en su contenido: válido, pesado y sin texto.
    pdfPrograma = pdfMinimo('0 0 0 rg 20 20 160 40 re f\n' + '% relleno ficticio para que el PDF pese\n'.repeat(Math.ceil((4 * MB) / 40)));
    expect(pdfPrograma.length).toBeGreaterThan(4 * MB);
    await s.llamar('uade_refresh', { topic: 'todo' });
    const [r, otra] = await Promise.all([s.llamar('webcampus_course_program', { subject: '3.1.024' }), s.llamar('webcampus_teachers', { idAula: '820004' })]);
    expect(r!.isError).toBe(false);
    expect(r!.data.nombre).toBe('MATEMÁTICA DISCRETA');
    expect(r!.data.texto).toMatch(/^\(PDF sin texto/); // no inventa contenido: dice que va como imagen o link
    expect(r!.texto.length).toBeLessThan(2000);
    expect(otra!.isError).toBe(false);
  });

  it('pasado el tope (11 MB) no se baja: error claro, y el servidor sigue atendiendo', async () => {
    pdfPrograma = new Uint8Array(11 * MB);
    await s.llamar('uade_refresh', { topic: 'todo' });
    const r = await s.llamar('webcampus_course_program', { subject: '3.1.024' });
    expect(r.isError).toBe(true);
    expect(r.texto).toBe('respuesta demasiado grande');
    pdfPrograma = null;
    expect((await s.llamar('webcampus_course_program', { subject: '3.1.024', query: 'bibliografía' })).data.nombre).toBe('MATEMÁTICA DISCRETA');
  });
});
