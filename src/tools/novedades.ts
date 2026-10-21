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
import { textoPagina } from '../sources/webcampus/secciones.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run, type Imagen } from './common.js';

const MAX_TEXTO = 8000;

// Lee bytes según el nombre o, si no tiene extensión conocida, según sus primeros bytes.
export async function leerBytes(nombre: string, bytes: Uint8Array): Promise<string> {
  const candidatos = tipoLegible(nombre) ? [nombre] : bytes[0] === 0x25 && bytes[1] === 0x50 ? ['archivo.pdf'] : bytes[0] === 0x50 && bytes[1] === 0x4b ? ['archivo.xlsx', 'archivo.docx', 'archivo.pptx'] : ['archivo.txt'];
  let ultimo = '';
  for (const c of candidatos) {
    try {
      const { texto } = await leerDocumento(c, bytes);
      if (texto.trim()) return texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO) + ' …(recortado)' : texto;
      if (/\.pdf$/i.test(c)) return '(PDF sin texto: es una imagen escaneada; abrilo vos para verlo)';
    } catch (err) {
      ultimo = (err as Error).message;
    }
  }
  throw new Error(`No pude leer ${nombre}${ultimo ? `: ${ultimo}` : ''}.`);
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

export function registerNovedadesTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus(), sp = new SharePointClient()): void {
  server.registerTool(
    'webcampus_news',
    {
      title: 'What UADE is announcing (WebCampus home)',
      description:
        'What UADE currently communicates to students on the WebCampus home: banners (campaigns, parking reservations, quiet classrooms, housing, schedules…), news items and the agenda (talks, events). No arguments: the list (agenda = next few events). allEvents=true: the full events agenda. eventId: one event with date, time, campus and description. newsId: the full text of a news item plus its attachments (e.g. the previos schedule). link: opens a banner/news link and returns its content when it points to a UADE document (PDF, SharePoint file, WebCampus attachment; scanned PDFs come back as images); for other sites it returns the final URL. Use this for "¿qué hay de nuevo?", quiet classrooms, parking, campaigns, talks, events.',
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
        const r = await cache.get('home', TTL.corto, () => wc.home());
        return { actualizado: r.actualizado, ...r.value, aviso: UNTRUSTED_NOTE };
      }),
  );
}
