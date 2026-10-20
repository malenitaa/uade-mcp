// Correlativas del plan, de WebCampus (Académico > Correlativas): la grilla de materias por año y
// cuatrimestre, y para cada una el árbol de "correlativas anteriores" que la página dibuja con
// ECOTree. Se toman solo las directas (hijas de la raíz): las de más abajo son correlativas de esas.
import * as cheerio from 'cheerio';
import { PageChangedError } from './parse.js';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface MateriaPlan {
  codigo: string;
  nombre: string;
  anio: string | null; // "1° Año"
  cuatrimestre: string | null; // "1° Cuatrimestre"
  anteriores: string[]; // códigos de las correlativas anteriores directas
}

export interface Correlativas {
  plan: string | null;
  materias: MateriaPlan[];
}

export function parseCorrelativas(html: string): Correlativas {
  const $ = cheerio.load(html);
  const tbl = $('#ctl00_ContentPlaceHolderMain_tbl_Materias');
  if (!tbl.length) throw new PageChangedError('correlativas del plan', $.html());
  const plan = clean(tbl.find('td.TablaTitFACU1').first().text()).match(/Plan:\s*(\d+)/)?.[1] ?? null;

  const anteriores = new Map<string, string[]>();
  const script = $('script').map((_, s) => $(s).html() ?? '').get().join('\n');
  for (const m of script.matchAll(/new ECOTree\('t','ArbolAnt([\w.]+)'\)([\s\S]*?)t\.UpdateTree/g)) {
    const directas = [...m[2]!.matchAll(/t\.add\((\d+),(-?\d+),"([\w.]+)"/g)].filter((a) => a[2] === '1').map((a) => a[3]!);
    anteriores.set(m[1]!, [...new Set(directas)]);
  }

  const materias: MateriaPlan[] = [];
  let anio: string | null = null;
  let cuatrimestre: string | null = null;
  tbl.children('tbody').children('tr').each((_, tr) => {
    const tds = $(tr).children('td');
    const texto = clean($(tr).text());
    if (tds.length === 1) {
      if (/^\d+°\s*Año$/i.test(texto)) { anio = texto; cuatrimestre = null; }
      else if (/^\d+°\s*Cuatrimestre$/i.test(texto)) cuatrimestre = texto;
      return;
    }
    const codigo = clean(tds.filter('.materias2').first().text());
    if (!/^[A-Z]?\d+(\.\d+)+$/.test(codigo)) return;
    materias.push({ codigo, nombre: clean(tds.filter('.materias').first().text()), anio, cuatrimestre, anteriores: anteriores.get(codigo) ?? [] });
  });
  if (!materias.length) throw new PageChangedError('correlativas del plan (sin materias)', $.html());
  return { plan, materias };
}
