// Secciones informativas del menú de WebCampus (páginas o PDFs de dre.uade.edu.ar), leídas con
// un único lector genérico. Solo lectura: no se incluyen formularios (simulación de equivalencias,
// lista de espera MRI) ni nada de la lista negra (pagos, datos personales, trámites).
import * as cheerio from 'cheerio';
import { leerPdf } from '../calendario/index.js';
import { WEBCAMPUS } from './client.js';
import { SharePointClient } from '../sharepoint/index.js';
import { WebCampusClient } from './client.js';
import { PageChangedError } from './parse.js';

// Número = ítem del menú (Principal.aspx?MenuItemId=N); texto = ruta directa en WebCampus.
export const SECCIONES = {
  wifi: '/MiContenido/Wifi.aspx',
  aranceles_pdf: 160, // la página de Aranceles enlaza al PDF vigente en SharePoint (montos, vencimientos)
  aranceles: 160,
  materias_intensivas_mri: 173,
  carreras: 83,
  intercambio: 358,
  becas: 443,
  deportes: 199,
  ayuda_estudiante: 194,
  comprobantes: 115,
  marcaciones: 161,
  normativa_academica: 280,
  guia_alumnos: 269,
  optativas: 273,
  minors: 588,
  mencion_honor: 568,
  housing: 200,
  emergencias: 483,
  lineamientos_ia: 593,
  codigo_conducta: 219,
  compromiso_uade: 225,
  codigo_vestimenta: 513,
  protocolo_intervencion: 368,
} as const;
export type Seccion = keyof typeof SECCIONES;

const MAX_TEXTO = 8000;
const MAX_GUIAS = 6;
// Guías en PDF que una página de WebCampus enlaza (por ejemplo, las de Wi-Fi por sistema operativo).
export function guiasEnlazadas(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = $('a[href]')
    .map((_, a) => new URL($(a).attr('href')!, WEBCAMPUS))
    .get()
    .filter((u) => u.origin === WEBCAMPUS && /^\/Docs\/[^/]+\.pdf$/i.test(u.pathname))
    .map((u) => u.pathname);
  return [...new Set(urls)].slice(0, MAX_GUIAS);
}
const CACHE_MS = 60 * 60 * 1000;

export interface TextoSeccion {
  seccion: Seccion;
  fuente: string; // URL de la página o del PDF
  texto: string;
  recortado?: boolean;
}

// Texto principal de una página de WebCampus: los bloques del contenido (ids ctl00_ContentPlaceHolderMain…),
// sin menú, scripts ni estilos.
export function textoPagina(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, input[type=hidden]').remove();
  // Separar bloques: si no, "<h3>Becas</h3><p>Requisitos" queda "BecasRequisitos".
  $('p, div, li, td, th, tr, br, h1, h2, h3, h4, h5, h6, span, a, strong').append(' ');
  const bloques = $('[id^="ctl00_ContentPlaceHolderMain"]').filter((_, e) => !$(e).parents('[id^="ctl00_ContentPlaceHolderMain"]').length);
  if (!bloques.length) throw new PageChangedError('sección de WebCampus');
  return bloques.map((_, e) => $(e).text()).get().join(' ').replace(/\s+/g, ' ').trim();
}

// Fragmentos alrededor de cada aparición de la consulta (por palabras, sin tildes).
export function fragmentos(texto: string, consulta: string, radio = 350): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = norm(texto);
  const palabras = norm(consulta).split(/\s+/).filter((w) => w.length >= 3);
  if (!palabras.length) return [];
  const out: string[] = [];
  let desde = 0;
  while (out.length < 8) {
    const hits = palabras.map((w) => t.indexOf(w, desde)).filter((i) => i >= 0);
    if (!hits.length) break;
    const i = Math.min(...hits);
    const ini = Math.max(0, i - radio);
    const fin = Math.min(texto.length, i + radio);
    out.push((ini > 0 ? '…' : '') + texto.slice(ini, fin).trim() + (fin < texto.length ? '…' : ''));
    desde = fin;
  }
  return out;
}

export class Secciones {
  private cache = new Map<Seccion, { at: number; data: Omit<TextoSeccion, 'recortado'> }>();

  constructor(
    private readonly client = new WebCampusClient(),
    private readonly sharepoint = new SharePointClient(),
  ) {}

  private async leer(seccion: Seccion): Promise<Omit<TextoSeccion, 'recortado'>> {
    const hit = this.cache.get(seccion);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const destino = SECCIONES[seccion];
    const r = await this.client.get(typeof destino === 'number' ? `/Principal.aspx?MenuItemId=${destino}` : destino);
    if (seccion === 'aranceles_pdf') {
      const link = cheerio.load(r.html)('a[href*="sharepoint.com"]').first().attr('href');
      if (!link) throw new PageChangedError('aranceles (link al PDF)');
      const data = { seccion, fuente: link, texto: (await leerPdf(await this.sharepoint.descargar(link))).texto };
      this.cache.set(seccion, { at: Date.now(), data });
      return data;
    }
    const esPdf = r.bytes[0] === 0x25 && r.bytes[1] === 0x50; // "%P"
    let texto = esPdf ? (await leerPdf(r.bytes)).texto : textoPagina(r.html);
    if (!esPdf) {
      for (const guia of guiasEnlazadas(r.html)) {
        try {
          const g = await this.client.get(guia);
          texto += `\n\n[Guía: ${decodeURIComponent(guia.split('/').pop()!)}] ${(await leerPdf(g.bytes)).texto}`;
        } catch {
          texto += `\n\n[Guía: ${guia}] (no se pudo leer)`;
        }
      }
    }
    const data = { seccion, fuente: r.url.href, texto };
    this.cache.set(seccion, { at: Date.now(), data });
    return data;
  }

  // Texto entero de una sección (sin recortar), para parsers propios.
  async textoCompleto(seccion: Seccion): Promise<{ fuente: string; texto: string }> {
    const d = await this.leer(seccion);
    return { fuente: d.fuente, texto: d.texto };
  }

  async consultar(seccion: Seccion, consulta?: string): Promise<TextoSeccion | (Omit<TextoSeccion, 'texto'> & { fragmentos: string[] })> {
    const d = await this.leer(seccion);
    if (consulta) {
      const f = fragmentos(d.texto, consulta);
      return { seccion, fuente: d.fuente, fragmentos: f.length ? f : [`No aparece "${consulta}" en esta sección.`] };
    }
    if (!d.texto) return { ...d, texto: '(la sección no tiene texto: puede ser un PDF escaneado o una página que se completa con filtros)' };
    return d.texto.length > MAX_TEXTO ? { ...d, texto: d.texto.slice(0, MAX_TEXTO) + ' … (recortado: pasá query para buscar una parte)', recortado: true } : d;
  }
}
