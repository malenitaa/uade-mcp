// Secciones informativas del menú de WebCampus (páginas o PDFs de dre.uade.edu.ar), leídas con
// un único lector genérico. Solo lectura: no se incluyen formularios (simulación de equivalencias,
// lista de espera MRI) ni nada de la lista negra (pagos, datos personales, trámites).
import * as cheerio from 'cheerio';
import { leerPdf } from '../calendario/index.js';
import { fragmentos } from '../docs/fragmentos.js';
import { textoOImagenes } from '../docs/legible.js';
import { safeFetch } from '../../net/http.js';
import { PolicyError } from '../../net/policy.js';
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
  admision_sia: 93, // Sistema de Admisión (SIA), ENI (nivel de inglés) y ENE, con la guía de ingreso
} as const;
export type Seccion = keyof typeof SECCIONES;

const MAX_TEXTO = 8000;
const MAX_GUIAS = 6;
// Guías en PDF que una página de WebCampus enlaza: las propias (/Docs/…, con sesión) y las públicas
// de dre.uade.edu.ar (talleres de AYUES, guía de ingreso), que se bajan sin cookies.
export function guiasEnlazadas(html: string): string[] {
  const $ = cheerio.load(html);
  // Solo los links del contenido de la sección, no los del pie de página (que están en todas).
  const urls = $('[id^="ctl00_ContentPlaceHolderMain"] a[href]')
    .map((_, a) => { try { return new URL($(a).attr('href')!, WEBCAMPUS); } catch { return null; } })
    .get()
    .filter((u): u is URL => !!u)
    .filter((u) => (u.origin === WEBCAMPUS && /^\/Docs\/[^/]+\.pdf$/i.test(u.pathname)) || (/^(www\.)?dre\.uade\.edu\.ar$/i.test(u.hostname) && /\.pdf$/i.test(u.pathname)))
    .map((u) => (u.origin === WEBCAMPUS ? u.pathname : `https://${u.hostname}${u.pathname}`));
  return [...new Set(urls)].slice(0, MAX_GUIAS);
}
const CACHE_MS = 60 * 60 * 1000;

export const TEXTO_DOCUMENTO_PESADO = '(Este documento pesa más de 10 MB y el MCP no lo descarga. Abrilo en WebCampus, con tu sesión:';

export interface TextoSeccion {
  seccion: Seccion;
  fuente: string; // URL de la página o del PDF
  texto: string;
  recortado?: boolean;
  // PDF sin texto legible (escaneado, dibujado o con fuentes sin mapa): sus imágenes en base64.
  imagenes?: { mimeType: string; base64: string }[];
}

// Texto principal de una página de WebCampus: los bloques del contenido (ids ctl00_ContentPlaceHolderMain…),
// sin menú, scripts ni estilos.
export function textoPagina(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, input[type=hidden]').remove();
  // Separar bloques: si no, "<h3>Becas</h3><p>Requisitos" queda "BecasRequisitos".
  $('p, div, li, td, th, tr, br, h1, h2, h3, h4, h5, h6, span, a, strong').append(' ');
  const bloques = $('[id^="ctl00_ContentPlaceHolderMain"]').filter((_, e) => !$(e).parents('[id^="ctl00_ContentPlaceHolderMain"]').length);
  if (!bloques.length) throw new PageChangedError('sección de WebCampus', $.html());
  return bloques.map((_, e) => $(e).text()).get().join(' ').replace(/\s+/g, ' ').trim();
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
    const path = typeof destino === 'number' ? `/Principal.aspx?MenuItemId=${destino}` : destino;
    let r;
    try {
      r = await this.client.get(path);
    } catch (err) {
      // Un documento que pesa más del tope (Housing, en 11/2026: un PDF con fotos) no se baja: se
      // devuelve el link para abrirlo en WebCampus, sin inventar contenido.
      if (!(err instanceof PolicyError && /demasiado grande/.test(err.message))) throw err;
      const data = { seccion, fuente: WEBCAMPUS + path, texto: `${TEXTO_DOCUMENTO_PESADO} ${WEBCAMPUS}${path}` };
      this.cache.set(seccion, { at: Date.now(), data });
      return data;
    }
    if (seccion === 'aranceles_pdf') {
      const link = cheerio.load(r.html)('a[href*="sharepoint.com"]').first().attr('href');
      if (!link) throw new PageChangedError('aranceles (link al PDF)', r.html);
      const data = { seccion, fuente: link, texto: (await leerPdf(await this.sharepoint.descargar(link))).texto };
      this.cache.set(seccion, { at: Date.now(), data });
      return data;
    }
    const esPdf = r.bytes[0] === 0x25 && r.bytes[1] === 0x50; // "%P"
    // Un PDF sin texto legible (por ejemplo, "Números ante emergencias", dibujado) va como imágenes.
    let { texto, imagenes } = esPdf ? await textoOImagenes((await leerPdf(r.bytes)).texto, r.bytes) : { texto: textoPagina(r.html), imagenes: undefined };
    if (!esPdf) {
      for (const guia of guiasEnlazadas(r.html)) {
        const nombre = decodeURIComponent(guia.split('/').pop()!);
        try {
          const bytes = guia.startsWith('https://') ? (await safeFetch(guia)).body : (await this.client.get(guia)).bytes;
          const g = await textoOImagenes((await leerPdf(bytes)).texto, bytes);
          texto += `\n\n[Guía: ${nombre}] ${g.texto}`;
          if (g.imagenes?.length) imagenes = [...(imagenes ?? []), ...g.imagenes];
        } catch {
          texto += `\n\n[Guía: ${guia}] (no se pudo leer)`;
        }
      }
    }
    const data: Omit<TextoSeccion, 'recortado'> = { seccion, fuente: r.url.href, texto, imagenes };
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
    if (d.texto.length <= MAX_TEXTO) return d;
    // Con imágenes también se recorta (una guía con imagen no tiene que traer de arrastre 160 KB de
    // texto), pero las líneas que explican qué imagen es de qué guía quedan.
    const deImagenes = d.imagenes ? (d.texto.slice(MAX_TEXTO).match(/\[Guía: [^\]]+\] \(PDF[^)]*\)/g) ?? []) : [];
    return { ...d, texto: [d.texto.slice(0, MAX_TEXTO) + ' … (recortado: pasá query para buscar una parte)', ...deImagenes].join('\n\n'), recortado: true };
  }
}
