// Clases de consulta (Mi cursada > Clases de consulta, /Contenidos/MisClasesApoyo.aspx): la
// página pide elegir carrera y después materia (solo lista las que tienen clases de consulta), y
// muestra una grilla (RadGrid) con días y horarios. Como la grilla cambia según lo que UADE cargue,
// se devuelve cada fila con los encabezados que tenga, sin suponer columnas.
import * as cheerio from 'cheerio';
import { PageChangedError, requireAnchor, type FormState } from './parse.js';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface ClasesDeConsulta {
  carreras: { id: string; nombre: string }[];
  materias: { id: string; nombre: string }[];
  clases: Record<string, string>[];
  form: FormState;
  carrera?: string;
  materia?: string;
  aviso?: string;
}

export function parseClasesDeConsulta(html: string): ClasesDeConsulta {
  const $ = cheerio.load(html);
  requireAnchor($, 'select[name$="$ddlCarrera"]', 'clases de consulta');
  const form: FormState = {};
  $('form input[type=hidden]').each((_, i) => {
    const name = $(i).attr('name');
    if (name) form[name] = $(i).attr('value') ?? '';
  });
  const opciones = (sel: string) =>
    $(sel)
      .find('option')
      .map((_, o) => ({ id: $(o).attr('value') ?? '', nombre: clean($(o).text()) }))
      .get()
      .filter((o) => o.id && o.id !== '0');
  const grilla = $('table[id$="RadGrid1_ctl00"]');
  const cab = grilla.find('thead th').map((_, th) => clean($(th).text())).get();
  const clases: Record<string, string>[] = [];
  grilla.find('tbody tr').each((_, tr) => {
    const celdas = $(tr).children('td').map((_, td) => clean($(td).text())).get();
    if (celdas.length < 2 || /^sin resultados/i.test(celdas.join(' '))) return;
    const fila: Record<string, string> = {};
    celdas.forEach((c, i) => { if (c) fila[cab[i] || `columna${i + 1}`] = c; });
    clases.push(fila);
  });
  if (!$('select[name$="$ddlMateria"]').length) throw new PageChangedError('clases de consulta', $.html());
  return { carreras: opciones('select[name$="$ddlCarrera"]'), materias: opciones('select[name$="$ddlMateria"]'), clases, form };
}
