// Home de WebCampus: banners del carrusel (lo que UADE comunica: campañas, parking, aulas
// silenciosas…), novedades y agenda. Son datos institucionales (no personales) y cambian seguido:
// es la fuente para "¿qué hay de nuevo en UADE?" en vez de inventar o salir a internet.
import * as cheerio from 'cheerio';
import { PageChangedError } from './parse.js';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface Banner {
  titulo: string;
  link: string | null; // tal como está en WebCampus (puede ser un acortador de UADE)
}

export interface NovedadResumen {
  id: string;
  titulo: string;
  resumen: string | null;
}

export interface EventoAgenda {
  categoria: string | null;
  titulo: string;
  fecha: string | null; // ISO (año: el actual)
  hora: string | null;
  id: string | null;
}

export interface Home {
  banners: Banner[];
  novedades: NovedadResumen[];
  agenda: EventoAgenda[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaAgenda(dia: string, mes: string, hoy = new Date()): string | null {
  const m = MESES.indexOf(mes.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const d = Number(dia);
  if (m < 0 || !d) return null;
  // La agenda no trae el año: es el actual, salvo que el mes ya haya pasado hace mucho (enero visto en diciembre).
  let anio = hoy.getFullYear();
  if (m - hoy.getMonth() < -6) anio++;
  return `${anio}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const idDe = (href: string | undefined): string | null => href?.match(/[?&]Id=(\d+)/i)?.[1] ?? null;

export function parseHome(html: string, hoy = new Date()): Home {
  const $ = cheerio.load(html);
  const items = $('.carousel-item');
  if (!items.length && !$('a[href*="Novedades.aspx"]').length) throw new PageChangedError('home de WebCampus', $.html());

  const banners: Banner[] = [];
  items.each((_, it) => {
    const a = $(it).find('a').first();
    const img = $(it).find('img').first();
    const titulo = clean(a.attr('data-label') ?? img.attr('alt') ?? img.attr('title'));
    if (!titulo) return;
    const href = clean(a.attr('href'));
    banners.push({ titulo, link: href && href !== '#' ? href : null });
  });

  const novedades: NovedadResumen[] = [];
  const vistos = new Set<string>();
  $('a[href*="Novedades.aspx?Id="]').each((_, a) => {
    const id = idDe($(a).attr('href'));
    const titulo = clean($(a).text());
    if (!id || vistos.has(id) || !titulo || /^ver m[aá]s$/i.test(titulo)) return;
    vistos.add(id);
    const bloque = clean($(a).closest('div').text()).replace(titulo, '').replace(/VER MÁS/gi, '').trim();
    novedades.push({ id, titulo, resumen: bloque ? bloque.slice(0, 300) : null });
  });

  const agenda: EventoAgenda[] = [];
  $('.card.agenda').each((_, c) => {
    const titulo = clean($(c).find('.agenda-tit-home').first().text());
    if (!titulo) return;
    const f = clean($(c).find('.agenda-fecha-home').first().text()).match(/(\d{1,2})\s+([A-Za-zÁ-ú]+)/);
    agenda.push({
      categoria: clean($(c).find('.agenda-titulo-facultad').first().text()) || null,
      titulo,
      fecha: f ? fechaAgenda(f[1]!, f[2]!, hoy) : null,
      hora: clean($(c).find('.agenda-hora-home').first().text()).replace(/\s*hs\.?\s*$/i, '') || null,
      id: idDe($(c).find('a[href*="Agenda.aspx"]').first().attr('href')),
    });
  });
  return { banners, novedades, agenda };
}

export interface Novedad {
  id: string;
  titulo: string;
  texto: string;
  adjuntos: string[]; // paths/URLs tal como los enlaza la novedad
}

export function parseNovedad(html: string, id: string): Novedad {
  const $ = cheerio.load(html);
  const panel = $('#ctl00_ContentPlaceHolderMain_Pnl_Novedad');
  if (!panel.length) throw new PageChangedError('novedad de WebCampus', $.html());
  panel.find('p, div, li, br, h1, h2, h3, h4, a, td, tr, span').append(' ');
  const titulo = clean(panel.find('h1, h2, h3, .titulo, b, strong').first().text()) || clean(panel.text()).slice(0, 80);
  const adjuntos = panel.find('a[href]').map((_, a) => $(a).attr('href')!).get().filter((h) => /DocsDownload|\.pdf$|\.xlsx?$|\.docx?$|sharepoint\.com|short\.gy/i.test(h));
  return { id, titulo, texto: clean(panel.text()), adjuntos };
}

// ── Agenda completa (MiContenido/Eventos.aspx) y detalle de un evento (MiContenido/Agenda.aspx?Id=) ──

export function parseEventos(html: string, hoy = new Date()): EventoAgenda[] {
  const $ = cheerio.load(html);
  const cards = $('.card.agenda');
  if (!cards.length && !$('[id$="Pnl_Tabs"]').length) throw new PageChangedError('agenda de eventos de WebCampus', $.html());
  const out: EventoAgenda[] = [];
  const vistos = new Set<string>();
  cards.each((_, c) => {
    const titulo = clean($(c).find('.agenda-tit-home').first().text());
    const id = idDe($(c).find('a[href*="Agenda.aspx"]').first().attr('href'));
    if (!titulo || (id && vistos.has(id))) return;
    if (id) vistos.add(id);
    const f = clean($(c).find('.agenda-fecha-home').first().text()).match(/(\d{1,2})\s+([A-Za-zÁ-ú]+)/);
    out.push({
      categoria: clean($(c).find('.agenda-titulo-facultad').first().text()) || null,
      titulo,
      fecha: f ? fechaAgenda(f[1]!, f[2]!, hoy) : null,
      hora: clean($(c).find('.agenda-hora-home').first().text()).replace(/^de\s+/i, 'De ').replace(/\s*hs\.?\s*$/i, '') || null,
      id,
    });
  });
  return out;
}

export interface Evento {
  id: string;
  titulo: string;
  organiza: string | null; // "Fac. de Ingeniería y Ciencias Exactas (Charlas)"
  fechaTexto: string | null; // "Miercoles 21 de octubre" (sin año, tal como lo publica WebCampus)
  hora: string | null;
  lugar: string | null;
  texto: string;
}

export function parseEvento(html: string, id: string): Evento {
  const $ = cheerio.load(html);
  const panel = $('#ctl00_ContentPlaceHolderMain_Pnl_Agenda');
  if (!panel.length) throw new PageChangedError('evento de la agenda de WebCampus', $.html());
  panel.find('p, div, li, br, h1, h2, h3, h4, td, tr').append(' ');
  const ps = panel.find('p.card-text').map((_, p) => clean($(p).text())).get();
  const cuerpo = panel.find('.card-text.mt-4').first();
  return {
    id,
    titulo: clean(panel.find('h1').first().text()),
    organiza: clean(panel.find('h2').first().text()) || null,
    fechaTexto: ps.find((t) => /\d{1,2}\s+de\s+[a-zá-ú]+/i.test(t)) ?? null,
    hora: (ps.find((t) => /\d{1,2}:\d{2}/.test(t)) ?? '').replace(/\s*hs\.?\s*$/i, '') || null,
    lugar: ps.find((t) => !/\d{1,2}:\d{2}/.test(t) && !/\d{1,2}\s+de\s+[a-zá-ú]+/i.test(t)) ?? null,
    texto: clean(cuerpo.length ? cuerpo.text() : panel.text()),
  };
}
