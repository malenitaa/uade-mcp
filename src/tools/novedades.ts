// webcampus_news: lo que UADE comunica en el home de WebCampus (banners, novedades, agenda) y el
// contenido de lo que enlazan (PDFs de dre.uade.edu.ar, archivos compartidos de SharePoint,
// adjuntos de novedades). Si un link va a un sitio fuera del MCP, se devuelve el link y se dice.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { cache, TTL } from '../cache/cache.js';
import { ALLOWED_HOSTS } from '../net/policy.js';
import { safeFetch } from '../net/http.js';
import { leerDocumento, tipoLegible } from '../sources/docs/leer.js';
import { aBase64, imagenesDePdf } from '../sources/docs/pdf-imagenes.js';
import { SharePointClient, SHAREPOINT } from '../sources/sharepoint/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import type { Banner } from '../sources/webcampus/novedades.js';
import { textoPagina } from '../sources/webcampus/secciones.js';
import { untrusted, UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run, type Imagen } from './common.js';
import { ErrorDeUso } from '../error-de-uso.js';

const MAX_TEXTO = 8000;

// Lee bytes según el nombre o, si no tiene extensión conocida, según sus primeros bytes.
export async function leerBytes(nombre: string, bytes: Uint8Array): Promise<string> {
  const candidatos = tipoLegible(nombre) ? [nombre] : bytes[0] === 0x25 && bytes[1] === 0x50 ? ['archivo.pdf'] : bytes[0] === 0x50 && bytes[1] === 0x4b ? ['archivo.xlsx', 'archivo.docx', 'archivo.pptx'] : ['archivo.txt'];
  let ultimo = '';
  for (const c of candidatos) {
    try {
      const { texto } = await leerDocumento(c, bytes);
      if (texto.trim()) return untrusted(nombre, texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO) + ' …(recortado)' : texto);
      if (/\.pdf$/i.test(c)) return '(PDF sin texto: es una imagen escaneada; abrilo vos para verlo)';
    } catch (err) {
      ultimo = (err as Error).message;
    }
  }
  throw new ErrorDeUso(`No pude leer ${nombre}${ultimo ? `: ${ultimo}` : ''}.`);
}

export interface Lectura {
  url: string; // destino final
  texto?: string;
  nota?: string;
  // PDF escaneado (sin texto): sus imágenes, para que el modelo las mire.
  imagenes?: Imagen[];
}

// Texto de un documento; si es un PDF sin texto, sus imágenes.
export async function leerBytesOImagenes(nombre: string, bytes: Uint8Array): Promise<{ texto: string; imagenes?: Imagen[] }> {
  const texto = await leerBytes(nombre, bytes);
  if (!/^\(PDF sin texto/.test(texto)) return { texto };
  const imgs = imagenesDePdf(bytes).map((i) => ({ mimeType: i.mimeType, base64: aBase64(i.bytes) }));
  return imgs.length
    ? { texto: `(PDF escaneado: no tiene texto; van ${imgs.length} imagen${imgs.length > 1 ? 'es' : ''} para que las leas)`, imagenes: imgs }
    : { texto };
}

// Sigue un link de WebCampus (incluido el acortador de UADE) y lee el destino si es un sitio del MCP.
export async function leerLink(link: string, deps: { wc: WebCampus; sp: SharePointClient }): Promise<Lectura> {
  const u = new URL(link, 'https://www.webcampus.uade.edu.ar');
  if (!ALLOWED_HOSTS.has(u.hostname)) return { url: u.href, nota: 'Es un sitio fuera del MCP: abrilo vos en el navegador.' };
  if (u.origin === SHAREPOINT) {
    try {
      const { nombre, bytes } = await deps.sp.descargarCompartido(u.href);
      return { url: u.href, ...(await leerBytesOImagenes(nombre, bytes)) };
    } catch (err) {
      return { url: u.href, nota: (err as Error).message };
    }
  }
  if (/webcampus\.uade\.edu\.ar$/.test(u.hostname)) {
    const { nombre, bytes } = await deps.wc.archivo(u.pathname + u.search);
    return { url: u.href, ...(await leerBytesOImagenes(nombre, bytes)) };
  }
  // Acortador o dre.uade.edu.ar: sin cookies (no son sitios con sesión); se sigue la redirección.
  const res = await safeFetch(u, { method: 'GET', redireccionAfuera: 'devolver' });
  const final = res.url;
  if (res.fueraDelMcp || !ALLOWED_HOSTS.has(final.hostname)) return { url: final.href, nota: 'Es un sitio fuera del MCP: abrilo vos en el navegador.' };
  if (final.origin === SHAREPOINT) return leerLink(final.href, deps);
  if (res.status >= 400) return { url: final.href, nota: `El sitio respondió ${res.status}.` };
  const nombre = decodeURIComponent(final.pathname.split('/').pop() ?? '');
  if (/\.html?$/i.test(nombre) || /^text\/html/i.test(res.headers.get('content-type') ?? '')) {
    let texto: string;
    try {
      texto = textoPagina(res.text());
    } catch {
      texto = res.text().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return { url: final.href, texto: texto.slice(0, MAX_TEXTO) };
  }
  return { url: final.href, ...(await leerBytesOImagenes(nombre, res.body)) };
}

// Banners del home: muchos tienen el aviso (cierres, feriados, cambios de horario o de sede) solo
// dentro de la imagen, así que se bajan y van al modelo como imágenes, en el orden del carrusel.
export const MAX_BANNERS = 20;
export const MAX_BYTES_BANNER = 1.5 * 1024 * 1024;
export interface ImagenBanner {
  tamanio: number;
  mimeType?: string;
  base64?: string; // falta si la imagen pasa el tope de bytes
}

export async function bannersConImagenes(
  banners: Banner[],
  bajar: (url: string) => Promise<ImagenBanner>,
): Promise<{ banners: Record<string, unknown>[]; imagenes: Imagen[] }> {
  const aBajar = banners.filter((b) => b.imagen).slice(0, MAX_BANNERS);
  const bajadas = await Promise.allSettled(aBajar.map((b) => bajar(b.imagen!)));
  const imagenes: Imagen[] = [];
  const salida = banners.map(({ imagen, ...b }) => {
    if (!imagen) return b;
    const i = aBajar.findIndex((x) => x.imagen === imagen);
    if (i < 0) return { ...b, imagenUrl: imagen, nota: `No mandé esta imagen (tope de ${MAX_BANNERS} banners): abrila vos si hace falta.` };
    const r = bajadas[i]!;
    if (r.status === 'rejected') return { ...b, imagenUrl: imagen, nota: `No pude bajar la imagen: ${(r.reason as Error).message}` };
    if (!r.value.base64 || !r.value.mimeType) {
      return { ...b, imagenUrl: imagen, nota: `La imagen pesa ${(r.value.tamanio / 1024 / 1024).toFixed(1).replace('.', ',')} MB (tope 1,5 MB): no la mandé; abrila vos.` };
    }
    imagenes.push({ mimeType: r.value.mimeType, base64: r.value.base64 });
    return { ...b, verImagen: imagenes.length };
  });
  return { banners: salida, imagenes };
}

export function registerNovedadesTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus(), sp = new SharePointClient()): void {
  server.registerTool(
    'webcampus_news',
    {
      title: 'What UADE is announcing (WebCampus home)',
      description:
        'What UADE currently communicates to students on the WebCampus home: banners (campaigns, parking reservations, quiet classrooms, housing, schedules…), news items and the agenda (talks, events). No arguments: the list (agenda = next few events) plus the banner images in carousel order (verImagen = image number): READ them, banners often carry university closures, holidays, schedule or campus changes only inside the image; tell the student what they say in text, do not show or send the images. Call it too when the student asks about a specific day or week (¿qué tengo el lunes?, ¿hay clases el 9?, ¿abre la facultad?). allEvents=true: the full events agenda. eventId: one event with date, time, campus and description. newsId: the full text of a news item plus its attachments (e.g. the previos schedule). link: opens a banner/news link and returns its content when it points to a UADE document (PDF, SharePoint file, WebCampus attachment; scanned PDFs come back as images); for other sites it returns the final URL. Use this for "¿qué hay de nuevo?", quiet classrooms, parking, campaigns, talks, events.',
      inputSchema: {
        newsId: z.string().regex(/^\d+$/).optional(),
        eventId: z.string().regex(/^\d+$/).optional().describe('id from the agenda'),
        allEvents: z.boolean().default(false).describe('the whole events agenda, not only the next few'),
        link: z.string().url().max(500).optional().describe('a banner or news link as returned by this tool'),
      },
      annotations: READ_ONLY,
    },
    ({ newsId, eventId, allEvents, link }) =>
      run(granted, 'webcampus.leer', async () => {
        if (link) {
          const r = await cache.get(`link:${link}`, TTL.dia, () => leerLink(link, { wc, sp }));
          const { imagenes, ...resto } = r.value;
          return { actualizado: r.actualizado, ...resto, aviso: UNTRUSTED_NOTE, [CON_IMAGENES]: imagenes };
        }
        if (eventId) {
          const r = await cache.get(`evento:${eventId}`, TTL.dia, () => wc.evento(eventId));
          return { actualizado: r.actualizado, ...r.value, aviso: UNTRUSTED_NOTE, nota: 'Inscribirse al evento se hace en WebCampus (botón Inscribirme): el MCP no lo hace.' };
        }
        if (allEvents) {
          const r = await cache.get('eventos', TTL.corto, () => wc.eventos());
          return { actualizado: r.actualizado, eventos: r.value, aviso: UNTRUSTED_NOTE };
        }
        if (newsId) {
          const r = await cache.get(`novedad:${newsId}`, TTL.dia, async () => {
            const n = await wc.novedad(newsId);
            const adjuntos: { nombre: string; texto?: string; nota?: string }[] = [];
            for (const a of n.adjuntos.slice(0, 4)) {
              try {
                const l = await leerLink(a, { wc, sp });
                adjuntos.push({ nombre: a.split('/').pop() ?? a, texto: l.texto, nota: l.nota });
              } catch (err) {
                adjuntos.push({ nombre: a, nota: (err as Error).message });
              }
            }
            return { ...n, adjuntos };
          });
          return { actualizado: r.actualizado, ...r.value, aviso: UNTRUSTED_NOTE };
        }
        const r = await cache.get('home:v2', TTL.corto, () => wc.home());
        const { banners, imagenes } = await bannersConImagenes(r.value.banners, (url) =>
          cache.get(`banner:${url}`, TTL.dia, async () => {
            const { mimeType, bytes } = await wc.imagenBanner(url);
            return bytes.length > MAX_BYTES_BANNER ? { tamanio: bytes.length } : { tamanio: bytes.length, mimeType, base64: aBase64(bytes) };
          }).then((x) => x.value),
        );
        return {
          actualizado: r.actualizado,
          ...r.value,
          banners,
          imagenesDeBanners: imagenes.length
            ? `Van ${imagenes.length} imágenes de banners, en el orden de la lista (verImagen = número de imagen). Leelas: el aviso suele estar solo en la imagen (cierres de la universidad, feriados, cambios de horario o de sede, fechas). Al estudiante contale con texto lo que dicen; no le mandes ni le muestres las imágenes.`
            : r.value.banners.some((b) => b.imagen) ? 'No pude bajar ninguna imagen de los banners: el texto de cada uno puede estar incompleto; pasale al estudiante los links.' : undefined,
          aviso: UNTRUSTED_NOTE,
          [CON_IMAGENES]: imagenes,
        };
      }),
  );
}
