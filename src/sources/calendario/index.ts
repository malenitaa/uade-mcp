// Calendario académico y cronogramas de inscripción de UADE. Se parte del menú de WebCampus
// ("Calendario académico" y "Cronogramas de inscripción"), que redirige a PDFs fijos en
// dre.uade.edu.ar que UADE actualiza cada cuatrimestre; esos PDFs son índices con links a los
// PDFs de detalle (por sede, por tipo de inscripción). Se recorren hasta dos niveles y se
// devuelve el texto de cada uno. Nada está cargado a mano: si UADE cambia los PDFs, cambia esto.
import { extractText, getDocumentProxy } from 'unpdf';
import { safeFetch } from '../../net/http.js';
import { WebCampusClient } from '../webcampus/client.js';

const MENU = { calendario: 403, inscripciones: 428 } as const;
export type TemaCalendario = keyof typeof MENU;

const MAX_PDFS = 20;
const MAX_TEXTO = 6000;
const CACHE_MS = 60 * 60 * 1000;
const DRE = /^https?:\/\/(www\.)?dre\.uade\.edu\.ar\/.+\.pdf$/i;

export interface DocumentoCalendario {
  url: string;
  nombre: string;
  nivel: number; // 0 = el índice del menú
  texto: string;
}

interface PdfLeido {
  texto: string;
  links: string[];
}

export async function leerPdf(bytes: Uint8Array): Promise<PdfLeido> {
  // unpdf trae pdf.js 6.x: CVE-2024-4367 (ejecución de código con fuentes armadas) se corrigió en 4.2.67
  // quitando ese camino, así que no hace falta isEvalSupported. verbosity: 0 = sin warnings en la terminal.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  const links: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    for (const a of await (await pdf.getPage(i)).getAnnotations()) {
      const u = (a as { url?: string; unsafeUrl?: string }).url ?? (a as { unsafeUrl?: string }).unsafeUrl;
      if (u) links.push(u);
    }
  }
  const { text } = await extractText(pdf, { mergePages: true });
  return { texto: String(text).replace(/\s+/g, ' ').trim(), links: [...new Set(links)] };
}

function nombreDe(url: string): string {
  return decodeURIComponent(url.split('/').pop() ?? url).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
}

export class Calendario {
  private cache = new Map<TemaCalendario, { at: number; docs: DocumentoCalendario[] }>();

  constructor(private readonly client = new WebCampusClient()) {}

  async documentos(tema: TemaCalendario): Promise<DocumentoCalendario[]> {
    const hit = this.cache.get(tema);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.docs;

    const raiz = await this.client.get(`/Principal.aspx?MenuItemId=${MENU[tema]}`);
    if (!DRE.test(raiz.url.href)) throw new Error('El menú de WebCampus no llevó a un PDF de UADE como se esperaba.');

    const docs: DocumentoCalendario[] = [];
    const vistos = new Set<string>();
    const cola: { url: string; nivel: number; bytes?: Uint8Array }[] = [{ url: raiz.url.href, nivel: 0, bytes: raiz.bytes }];
    while (cola.length && docs.length < MAX_PDFS) {
      const item = cola.shift()!;
      const url = item.url.replace(/^http:/, 'https:');
      if (vistos.has(url)) continue;
      vistos.add(url);
      try {
        const bytes = item.bytes ?? (await safeFetch(url)).body;
        const pdf = await leerPdf(bytes);
        docs.push({ url, nombre: nombreDe(url), nivel: item.nivel, texto: pdf.texto.slice(0, MAX_TEXTO) });
        if (item.nivel < 2) for (const l of pdf.links) if (DRE.test(l)) cola.push({ url: l, nivel: item.nivel + 1 });
      } catch {
        docs.push({ url, nombre: nombreDe(url), nivel: item.nivel, texto: '(no se pudo leer este PDF)' });
      }
    }
    this.cache.set(tema, { at: Date.now(), docs });
    return docs;
  }
}
