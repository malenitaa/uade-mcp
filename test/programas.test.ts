// Programa de una materia: el PDF real de Matemática Discreta (público para todo alumno, sin datos
// personales; entero porque recortarlo con PDFKit lo agranda) y la tool webcampus_course_program.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorDeUso } from '../src/error-de-uso.js';
import { buscarMateria, datosDelArchivo, programa } from '../src/sources/webcampus/programas.js';
import { registerWebCampusTools } from '../src/tools/webcampus.js';
import type { WebCampus } from '../src/sources/webcampus/index.js';

// La copia local cifrada no se toca desde los tests: el llavero y ~/.uade-mcp son reales.
vi.mock('../src/cache/cache.js', () => ({ TTL: { dia: 1, mes: 1 }, cache: { get: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => ({ value: await fn(), actualizado: '2026-11-07T00:00' }) } }));

const PDF = new Uint8Array(readFileSync(new URL('./fixtures/programas/matematica-discreta.pdf', import.meta.url)));
const WC = 'https://www.webcampus.uade.edu.ar';
const ARCHIVO = '/Programas/3.1.024_MATEM%c3%81TICA%20DISCRETA%20(PRESENCIAL)_12-08-2026.pdf';
const cliente = (url: string, bytes: Uint8Array = new TextEncoder().encode('<html></html>')) => {
  const pedidos: string[] = [];
  return { pedidos, get: async (path: string) => { pedidos.push(path); return { url: new URL(url), bytes, html: '' }; } };
};

describe('programa de una materia', () => {
  it('lee el PDF al que redirige WebCampus: nombre y fecha del archivo, texto entero', async () => {
    const c = cliente(WC + ARCHIVO, PDF);
    const p = await programa(c as never, '3.1.024');
    expect(c.pedidos).toEqual(['/Contenidos/DownloadPrograma.aspx?IdMateria=3.1.024&VieneDe=P&EsVirtual=False']);
    expect(p).toMatchObject({ codigo: '3.1.024', nombre: 'MATEMÁTICA DISCRETA', modalidad: 'presencial', fecha: '2026-08-12', link: WC + ARCHIVO });
    expect(p.texto).toContain('VIII. Bibliografía');
    expect(p.texto).toContain('Segunda evaluación parcial');
    expect(p.imagenes).toBeUndefined();
  });

  it('virtual pide EsVirtual=True', async () => {
    const c = cliente(WC + ARCHIVO.replace('PRESENCIAL', 'VIRTUAL'), PDF);
    expect((await programa(c as never, '3.1.024', 'virtual')).modalidad).toBe('virtual');
    expect(c.pedidos[0]).toContain('EsVirtual=True');
  });

  it('código inválido: error de uso sin pedir nada', async () => {
    const c = cliente(WC + ARCHIVO, PDF);
    await expect(programa(c as never, '3.1.024&x=1')).rejects.toThrow(ErrorDeUso);
    await expect(programa(c as never, '../Login')).rejects.toThrow('no es un código de materia');
    expect(c.pedidos).toEqual([]);
  });

  it('sin programa (Archivo404 o página vacía): error de uso claro', async () => {
    await expect(programa(cliente(`${WC}/Archivo404.aspx`) as never, '9.9.999')).rejects.toThrow(/UADE no tiene publicado un programa presencial para la materia 9\.9\.999/);
    await expect(programa(cliente(`${WC}/Contenidos/DownloadPrograma.aspx?IdMateria=9.9.999`) as never, '9.9.999')).rejects.toThrow(ErrorDeUso);
  });

  it('una redirección fuera de WebCampus no se lee', async () => {
    const p = programa(cliente('https://dre.uade.edu.ar/Programas/x.pdf', PDF) as never, '3.1.024');
    await expect(p).rejects.toThrow('no llevó a un PDF de WebCampus');
    await expect(p).rejects.not.toThrow(ErrorDeUso);
  });

  it('nombre del archivo con otra forma: sin nombre ni fecha, sin romper', () => {
    expect(datosDelArchivo('/Programas/3.4.208_PARADIGMA%20ORIENTADO%20A%20OBJETOS%20(VIRTUAL)_06-10-2026.pdf')).toEqual({ nombre: 'PARADIGMA ORIENTADO A OBJETOS', fecha: '2026-10-06' });
    expect(datosDelArchivo('/Programas/raro.pdf')).toEqual({});
  });

  it('buscarMateria: la igual gana; si no, las que contienen el nombre', () => {
    const plan = [
      { codigo: '3.1.001', nombre: 'ANÁLISIS MATEMÁTICO I' },
      { codigo: '3.1.002', nombre: 'ANÁLISIS MATEMÁTICO II' },
      { codigo: '3.1.024', nombre: 'MATEMATICA DISCRETA' },
    ];
    expect(buscarMateria(plan, 'analisis matematico i').map((m) => m.codigo)).toEqual(['3.1.001']);
    expect(buscarMateria(plan, 'Análisis').map((m) => m.codigo)).toEqual(['3.1.001', '3.1.002']);
    expect(buscarMateria(plan, 'Matemática Discreta').map((m) => m.codigo)).toEqual(['3.1.024']);
    expect(buscarMateria(plan, 'química')).toEqual([]);
  });
});

describe('webcampus_course_program', () => {
  type Resultado = { content: { type: string; text?: string }[]; isError?: boolean };
  const registrar = (wc: Partial<WebCampus>) => {
    const handlers = new Map<string, (a: Record<string, unknown>) => Promise<Resultado>>();
    const fake = { registerTool: (n: string, _c: unknown, h: (a: Record<string, unknown>) => Promise<Resultado>) => { handlers.set(n, h); } } as unknown as McpServer;
    registerWebCampusTools(fake, new Set(['webcampus.leer']), wc as WebCampus);
    return handlers.get('webcampus_course_program')!;
  };
  const wc = {
    programa: async (codigo: string) => programa(cliente(WC + ARCHIVO, PDF) as never, codigo),
    historial: async () => ({ carrera: 'INGENIERÍA EN INFORMÁTICA', plan: '1621', promedio: null, materias: [
      { codigo: '3.1.024', nombre: 'MATEMATICA DISCRETA' },
      { codigo: '3.1.001', nombre: 'ANÁLISIS MATEMÁTICO I' },
      { codigo: '3.1.002', nombre: 'ANÁLISIS MATEMÁTICO II' },
    ] }),
  } as unknown as Partial<WebCampus>;
  const json = (r: Resultado) => JSON.parse(r.content[0]!.text!);

  it('con nombre del plan y query: solo las secciones que la mencionan, enteras, con fecha argentina', async () => {
    const r = json(await registrar(wc)({ subject: 'matemática discreta', query: 'bibliografía', modality: 'presencial' }));
    expect(r).toMatchObject({ codigo: '3.1.024', nombre: 'MATEMÁTICA DISCRETA', fecha: '12/08/2026' });
    expect(r.texto).toBeUndefined();
    expect(r.partes).toHaveLength(1);
    expect(r.partes[0]).toMatch(/^VIII\. Bibliografía .*Obligatoria .*Grimaldi.*Complementaria .*Johnsonbaugh/);
    const aprob = json(await registrar(wc)({ subject: '3.1.024', query: 'promoción', modality: 'presencial' }));
    expect(aprob.partes.map((p: string) => p.slice(0, 15))).toEqual(['VII. Evaluación']);
  });

  it('sin query: el texto entero (entra bajo el tope), sin aviso de recorte', async () => {
    const r = json(await registrar(wc)({ subject: '3.1.024', modality: 'presencial' }));
    expect(r.texto).toContain('IX. Cronograma');
    expect(r.recortado).toBeUndefined();
  });

  it('nombre ambiguo o ajeno al plan: error de uso que pide repreguntar o el código', async () => {
    const amb = await registrar(wc)({ subject: 'análisis', modality: 'presencial' });
    expect(amb.isError).toBe(true);
    expect(amb.content[0]!.text).toMatch(/varias materias.*3\.1\.001 ANÁLISIS MATEMÁTICO I; 3\.1\.002/);
    const ajena = await registrar(wc)({ subject: 'derecho romano', modality: 'presencial' });
    expect(ajena.content[0]!.text).toMatch(/no está en tu plan.*pasá el código/);
    const malo = await registrar(wc)({ subject: '3.1', modality: 'presencial' });
    expect(malo.content[0]!.text).toContain('no es un código de materia');
  });
});

describe('partesDelPrograma sin la plantilla de secciones', () => {
  it('cae en fragmentos alrededor de cada aparición', async () => {
    const { partesDelPrograma } = await import('../src/sources/webcampus/programas.js');
    const texto = 'x'.repeat(800) + ' Bibliografía: Rosen, Matemática discreta. ' + 'y'.repeat(800);
    const p = partesDelPrograma(texto, 'bibliografía');
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Rosen');
    expect(p[0]!.length).toBeLessThan(800);
  });
});
