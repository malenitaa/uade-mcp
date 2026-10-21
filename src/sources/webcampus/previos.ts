// Cronograma de exámenes previos: WebCampus lo publica como un Excel adjunto a una novedad
// ("Exámenes Previos (noviembre - diciembre)…" → /DocsDownload/Novedades/<id>_<n>_previos….xlsx).
import * as cheerio from 'cheerio';
import { Unzip, UnzipInflate } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import { parseFecha } from './parse.js';

export interface ExamenPrevio {
  sede: string;
  codigo: string;
  materia: string;
  fecha: string | null; // ISO
  hora: string | null;
  aula: string | null;
  clase: string | null;
  docentes: string[];
}

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Links a novedades (para buscar la de exámenes previos).
export function parseLinksNovedades(html: string): string[] {
  const $ = cheerio.load(html);
  const ids = $('a[href*="Novedades.aspx?Id="]')
    .map((_, a) => ($(a).attr('href') ?? '').match(/Id=(\d+)/)?.[1])
    .get()
    .filter(Boolean);
  return [...new Set(ids)];
}

// Adjuntos .xlsx de una novedad cuyo título o link hable de "previos".
export function parseAdjuntoPrevios(html: string): string | null {
  const $ = cheerio.load(html);
  const titulo = norm(clean($('h1, h2, h3, h4').text()));
  const links = $('a[href*="/DocsDownload/"]').filter((_, a) => /\.xlsx?$/i.test($(a).attr('href') ?? ''));
  const elegido = links.filter((_, a) => /previo/i.test(($(a).attr('href') ?? '') + $(a).text())).first();
  const href = (elegido.length ? elegido : /EXAMENES PREVIOS/.test(titulo) ? links.first() : elegido).attr('href');
  if (!href) return null;
  const u = new URL(href, 'https://www.webcampus.uade.edu.ar');
  return /^\/DocsDownload\/Novedades\/[\w.-]+\.xlsx?$/i.test(u.pathname) ? u.pathname : null;
}

function fecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return parseFecha(clean(v));
}

export const MAX_DESCOMPRIMIDO = 60 * 1024 * 1024;

// Un .xlsx es un zip: antes de abrirlo se descomprime contando los bytes REALES (los tamaños que
// declara el zip se pueden falsear), y se corta si pasa el tope: un "zip bomb" no agota la memoria.
export function assertXlsxRazonable(bytes: Uint8Array, que = 'El Excel de exámenes previos'): void {
  let total = 0;
  let archivos = 0;
  const unzip = new Unzip((file) => {
    archivos++;
    file.ondata = (err, chunk) => {
      if (err) throw err;
      total += chunk.length;
      if (total > MAX_DESCOMPRIMIDO) throw new Error('demasiado grande');
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(bytes, true);
    if (!archivos) throw new Error('vacío');
  } catch {
    throw new Error(`${que} no es válido o es sospechosamente grande; no se abrió.`);
  }
}

export async function parsePreviosXlsx(bytes: Uint8Array): Promise<ExamenPrevio[]> {
  assertXlsxRazonable(bytes);
  // Siempre Buffer: a read-excel-file un string le indica una ruta de archivo.
  const rows = await readSheet(Buffer.from(bytes));
  const hdrIdx = rows.findIndex((r) => {
    const cells = r.map((c) => norm(clean(c)));
    return cells.includes('MATERIA') && cells.includes('FECHA');
  });
  if (hdrIdx < 0) throw new Error('El Excel de exámenes previos no tiene el formato esperado (no encontré MATERIA y FECHA).');
  const headers = rows[hdrIdx]!.map((c) => norm(clean(c)));
  const col = (...names: string[]) => headers.findIndex((h) => names.some((n) => h.startsWith(n)));
  const c = { sede: col('SEDE'), codigo: col('CODIGO'), materia: col('MATERIA'), fecha: col('FECHA'), hora: col('HORA'), aula: col('AULA'), clase: col('CLASE'), docentes: col('DOCENTE') };

  const out: ExamenPrevio[] = [];
  for (const r of rows.slice(hdrIdx + 1)) {
    const get = (i: number) => (i >= 0 ? clean(r[i]) : '');
    if (!get(c.materia)) continue;
    const docentes = get(c.docentes);
    out.push({
      sede: get(c.sede),
      codigo: get(c.codigo),
      materia: get(c.materia),
      fecha: c.fecha >= 0 ? fecha(r[c.fecha]) : null,
      hora: get(c.hora).replace(/\s*-\s*$/, '') || null,
      aula: get(c.aula) || null,
      clase: get(c.clase) || null,
      docentes: !docentes || /^a confirmar$/i.test(docentes) ? [] : docentes.split(';').map((d) => d.trim()).filter(Boolean),
    });
  }
  return out;
}

const STOP = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'EN', 'Y', 'E', 'A', 'AL', 'PARA', 'CON', 'POR', 'O', 'U']);
const palabras = (s: string) => norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

// Coincide por código (con o sin prefijo de variante, "V1.1.083" ~ "1.1.083") o por nombre:
// todas las palabras de la consulta tienen que estar en el nombre, sin importar artículos,
// tildes ni el orden ("gestión de las personas" ~ "Gestión de Personas en Organizaciones…").
export function coincide(e: ExamenPrevio, consulta: string): boolean {
  const q = consulta.trim();
  if (/^[A-Z]?\d+(\.\d+)+$/i.test(q)) return e.codigo.replace(/^[A-Z]/i, '') === q.replace(/^[A-Z]/i, '');
  const nombre = palabras(e.materia);
  const buscadas = palabras(q);
  return buscadas.length > 0 && buscadas.every((w) => nombre.some((n) => n === w || (w.length >= 4 && n.startsWith(w))));
}
