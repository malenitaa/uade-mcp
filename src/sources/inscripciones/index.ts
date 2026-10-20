// Sitio de inscripciones (inscripciones.uade.edu.ar): ventanas de inscripción con sus fechas y
// el link a la Programación de Clases de WebCampus. Solo lectura: no abre PIA ni inscribe.
import * as cheerio from 'cheerio';
import { keychainStore, renovarSesion, SessionClient, SessionExpiredError, type SessionStore } from '../../net/session.js';
import { PageChangedError, parseFecha } from '../webcampus/parse.js';

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
  // Link firmado a PIA (data-linkid) de una ventana abierta. Lleva la sesión de PIA: las tools
  // lo usan por dentro y no lo devuelven al modelo.
  link?: string;
}

export const PIA = 'https://inscripcionespia.uade.edu.ar';

function linkPia(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.origin === PIA ? u.href : undefined;
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
    throw new PageChangedError('ventanas de inscripción');
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
    const href = tipo === 'inscripcion' ? linkPia(link.attr('data-linkid')) : undefined;
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

  async linkProgramacion(): Promise<string> {
    const link = parseLinkProgramacion((await this.client.get('/')).html);
    if (!link) throw new Error('No encontré el link a la Programación de Clases en el sitio de inscripciones.');
    return link;
  }
}
