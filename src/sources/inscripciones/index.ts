// Sitio de inscripciones (inscripciones.uade.edu.ar): ventanas de inscripción con sus fechas, el
// cronograma por turno y cantidad de aprobadas (una imagen), el link a la Programación de Clases
// de WebCampus, y las pestañas Importante e Instructivos (avisos, tutoriales, preguntas
// frecuentes). Solo lectura: no abre PIA ni inscribe.
import * as cheerio from 'cheerio';
import { keychainStore, renovarSesion, SessionClient, SessionExpiredError, type SessionStore } from '../../net/session.js';
import { PageChangedError, parseFecha } from '../webcampus/parse.js';
import { tipoDeImagen } from '../docs/leer.js';

export const INSCRIPCIONES = 'https://inscripciones.uade.edu.ar';
export const INSCRIPCIONES_ACCOUNT = 'inscripciones';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export interface VentanaInscripcion {
  sede: string | null;
  nombre: string;
  tipo: 'inscripcion' | 'examenes' | 'bajas_o_cambios' | 'otro';
  abierta: boolean;
  desde: string | null; // ISO, con hora si la hay (yyyy-mm-ddThh:mm)
  hasta: string | null;
  // Link firmado a PIA (data-linkid) de una ventana abierta (materias: inscripcionespia; exámenes:
  // pia.uade.edu.ar). Lleva la sesión de PIA: las tools lo usan por dentro y no lo devuelven al modelo.
  link?: string;
}

export const PIA = 'https://inscripcionespia.uade.edu.ar';
// Los exámenes previos van a otra app de PIA, con otras pantallas (src/sources/pia/navegador-examen.ts).
export const PIA_EXAMEN = 'https://pia.uade.edu.ar';

function linkPia(raw: string | undefined, origen: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.origin === origen ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function fechaHora(raw: string): string | null {
  const d = parseFecha(raw);
  const h = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  return d && h ? `${d}T${h[1]!.padStart(2, '0')}:${h[2]}` : d;
}

export function parseVentanas(html: string): VentanaInscripcion[] {
  const $ = cheerio.load(html);
  // Con ventanas, hay .panel con .lbl-inscripciones; sin ventanas, UADE muestra igual el encabezado de sede.
  if (!$('.lbl-inscripciones').length && !$('span').filter((_, s) => / - (Grado|Posgrado)/i.test($(s).text())).length) {
    throw new PageChangedError('ventanas de inscripción', $.html());
  }
  const sede = clean($('span').filter((_, s) => / - (Grado|Posgrado)/i.test($(s).text())).first().text()) || null;
  const out: VentanaInscripcion[] = [];
  $('.panel').each((_, p) => {
    const nombre = clean($(p).find('.lbl-inscripciones').first().text());
    if (!nombre) return;
    const link = $(p).find('[data-tipolink]').first();
    const tipoLink = link.attr('data-tipolink') ?? '';
    const tipo = tipoLink === 'InscripcionAsignatura' ? 'inscripcion' : tipoLink === 'InscripcionExamen' || /^ex[aá]menes/i.test(nombre) ? 'examenes' : tipoLink === 'CambioAsignaturaPack' || /^bajas?\b/i.test(nombre) ? 'bajas_o_cambios' : 'otro';
    const v: VentanaInscripcion = {
      sede,
      nombre,
      tipo,
      abierta: link.length > 0 || $(p).find('.fa-unlock, [class*="_on"]').length > 0,
      desde: fechaHora(clean($(p).find('.desde').text())),
      hasta: fechaHora(clean($(p).find('.hasta').text())),
    };
    const href = tipo === 'inscripcion' ? linkPia(link.attr('data-linkid'), PIA) : tipo === 'examenes' ? linkPia(link.attr('data-linkid'), PIA_EXAMEN) : undefined;
    if (href) v.link = href;
    out.push(v);
  });
  return out;
}

// El link a la Programación de Clases viene con un IdUsuario cifrado que genera este sitio.
export function parseLinkProgramacion(html: string): string | null {
  const $ = cheerio.load(html);
  const href = $('a.btn_verdisp').attr('href') ?? $('a[href*="MiProgramacion.aspx?IdUsuario="]').attr('href');
  if (!href) return null;
  const u = new URL(href, 'https://www.webcampus.uade.edu.ar');
  if (u.origin !== 'https://www.webcampus.uade.edu.ar' || !/^\/MiProgramacion\/Contenidos\/MiProgramacion\.aspx$/i.test(u.pathname)) return null;
  return u.pathname + u.search;
}

// Pestaña "Cronograma inscripción": la grilla de fechas por turno y cantidad de materias aprobadas
// es una imagen (UADE la cambia cada cuatrimestre). Se devuelve su ruta para bajarla con la sesión.
export interface Cronograma {
  imagen: string; // path en el sitio
  alt: string | null;
}

export function parseCronograma(html: string): Cronograma {
  const $ = cheerio.load(html);
  const img = $('#menu2 img').first();
  const src = img.attr('src');
  if (!src) throw new PageChangedError('cronograma de inscripción (imagen)', $.html());
  const u = new URL(src.replace(/^~/, ''), INSCRIPCIONES);
  if (u.origin !== INSCRIPCIONES) throw new PageChangedError('cronograma de inscripción (imagen)', $.html());
  return { imagen: u.pathname + u.search, alt: clean(img.attr('alt')) || null };
}

// Pestañas Importante (avisos del momento), Instructivos (tutoriales) y Preguntas Frecuentes.
export interface GuiaInscripciones {
  importante: string[]; // "[imagen N]" marca dónde estaba cada imagen de imagenesImportante
  imagenesImportante: string[]; // paths en el sitio: parte del aviso está solo en la imagen
  instructivos: { titulo: string; link: string }[];
  preguntasFrecuentes: { pregunta: string; respuesta: string }[];
  ayuda: string | null; // link externo (help.uade.edu.ar), fuera del MCP
}

export function parseGuia(html: string): GuiaInscripciones {
  const $ = cheerio.load(html);
  if (!$('.nav-tabs').length || !$('#home, #menuImportante').length) throw new PageChangedError('guía del sitio de inscripciones', $.html());
  // Las imágenes de los avisos (la grilla que dice cómo se ven las modalidades nuevas, por ejemplo)
  // son parte del aviso: se marca dónde estaba cada una y se guarda su ruta, solo si es de este sitio.
  const imagenesImportante: string[] = [];
  $('#menuImportante .alert img[src]').each((_, img) => {
    let u: URL;
    try { u = new URL($(img).attr('src')!.replace(/^~/, ''), INSCRIPCIONES); } catch { return; }
    if (u.origin !== INSCRIPCIONES) return;
    const path = u.pathname + u.search;
    if (!imagenesImportante.includes(path)) imagenesImportante.push(path);
    $(img).replaceWith(` [imagen ${imagenesImportante.indexOf(path) + 1}] `);
  });
  $('script, style, noscript, img').remove();
  $('p, div, li, br, h1, h2, h3, h4, h5, td, tr').append(' ');

  const importante: string[] = [];
  $('#menuImportante .alert').each((_, a) => {
    $(a).find('ol li, ul li').each((_, li) => { $(li).prepend('• '); });
    $(a).find('a, button').filter((_, b) => /^(ver m[aá]s|inscribite)/i.test(clean($(b).text()))).remove();
    const t = clean($(a).text());
    if (t) importante.push(t);
  });

  const instructivos: { titulo: string; link: string }[] = [];
  $('#home a[href]').each((_, a) => {
    const titulo = clean($(a).text());
    const link = $(a).attr('href') ?? '';
    if (titulo && /^https?:\/\//.test(link)) instructivos.push({ titulo, link });
  });

  const preguntasFrecuentes: { pregunta: string; respuesta: string }[] = [];
  $('.panel-group .panel').each((_, p) => {
    const pregunta = clean($(p).find('.panel-title').text());
    const respuesta = clean($(p).find('.panel-body').text());
    if (pregunta && respuesta) preguntasFrecuentes.push({ pregunta, respuesta });
  });

  const ayuda = $('.nav-tabs a[href^="http"]').first().attr('href') ?? null;
  return { importante, imagenesImportante, instructivos, preguntasFrecuentes, ayuda };
}

export class InscripcionesClient extends SessionClient {
  constructor(store: SessionStore = keychainStore(INSCRIPCIONES_ACCOUNT)) {
    super(
      { nombre: 'Inscripciones', origin: INSCRIPCIONES, esLogin: (u) => /^\/account\/login/i.test(u.pathname) },
      store,
    );
  }
}

export class Inscripciones {
  constructor(private readonly client = new InscripcionesClient()) {}

  async ventanas(reintento = false): Promise<VentanaInscripcion[]> {
    try {
      return parseVentanas((await this.client.get('/Home/ObtenerInscripciones')).html);
    } catch (err) {
      // Con la sesión vencida este endpoint responde 500 en vez de mandar al login:
      // se pregunta a ValidarUsuario (devuelve true/false) para dar el mensaje correcto.
      if (err instanceof SessionExpiredError || !(await this.sesionValida())) {
        if (!reintento && (await renovarSesion())) return this.ventanas(true);
        throw new SessionExpiredError('Inscripciones');
      }
      throw err;
    }
  }

  private async sesionValida(): Promise<boolean> {
    try {
      return (await this.client.get('/Home/ValidarUsuario')).html.trim() === 'true';
    } catch {
      return false;
    }
  }

  // La imagen del cronograma, tal cual (JPEG/PNG), con su URL.
  async cronograma(): Promise<{ url: string; alt: string | null; mimeType: string; bytes: Uint8Array }> {
    const home = await this.client.get('/');
    const c = parseCronograma(home.html);
    const { mimeType, bytes } = await this.imagen(c.imagen, 'cronograma de inscripción (imagen)');
    return { url: INSCRIPCIONES + c.imagen, alt: c.alt, mimeType, bytes };
  }

  // Una imagen del sitio (path propio, con la sesión): solo JPEG, PNG, GIF o WebP.
  async imagen(path: string, que = 'imagen de un aviso de inscripción'): Promise<{ mimeType: string; bytes: Uint8Array }> {
    if (!path.startsWith('/')) throw new PageChangedError(que);
    const { bytes } = await this.client.get(path);
    const mimeType = tipoDeImagen(bytes);
    if (!mimeType) throw new PageChangedError(que);
    return { mimeType, bytes };
  }

  async guia(): Promise<GuiaInscripciones> {
    return parseGuia((await this.client.get('/')).html);
  }

  async linkProgramacion(): Promise<string> {
    const link = parseLinkProgramacion((await this.client.get('/')).html);
    if (!link) throw new Error('No encontré el link a la Programación de Clases en el sitio de inscripciones.');
    return link;
  }
}
