// Si el texto que salió de un PDF se puede leer o es basura. Algunos PDFs de UADE (los cronogramas
// de inscripción, hechos en Illustrator) llevan fuentes recortadas sin mapa de caracteres: el
// extractor devuelve un código de control por letra (\u001f\u001e…) y ningún lector puede hacer
// más. Se mide la proporción de letras y números sobre los caracteres que no son blancos.
import { aBase64, imagenesDePdf, pdfSinJpx } from './pdf-imagenes.js';
import { paginasComoImagenes } from './pdf-paginas.js';

const UMBRAL = 0.5;

export function textoLegible(texto: string): boolean {
  const sinBlancos = texto.replace(/\s/g, '');
  if (!sinBlancos) return false;
  const alfanumericos = sinBlancos.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return alfanumericos / sinBlancos.length >= UMBRAL;
}

export const TEXTO_ESCANEADO = '(PDF escaneado: no tiene texto';
export const TEXTO_DIBUJADO = '(PDF sin texto: es un dibujo o una foto';
export const TEXTO_ILEGIBLE = '(PDF con fuentes sin mapa de caracteres: no se puede leer como texto';
export const SIN_CONTENIDO = '(No pude sacar ni texto ni imágenes de este PDF';

export interface PdfLegible {
  texto: string;
  imagenes?: { mimeType: string; base64: string }[];
}

const van = (n: number, de: string) => `van ${n} ${n > 1 ? 'imágenes' : 'imagen'}${de} para que las leas)`;

// El único camino para un PDF ya leído: si su texto se lee, el texto; si no tiene texto y trae
// fotos (un escaneo), esas fotos tal cual; si no, sus páginas dibujadas; si nada de eso sale, un
// texto que lo dice, para que quien llama ponga el link. Las fotos JPEG 2000 se decodifican antes de
// dibujar (pdfSinJpx). Con texto ilegible no se miran las fotos
// embebidas: el texto está en vectores y las fotos serían solo el fondo del diseño.
export async function textoOImagenes(texto: string, bytes: Uint8Array): Promise<PdfLegible> {
  if (textoLegible(texto)) return { texto };
  const sinTexto = !texto.trim();
  if (sinTexto) {
    const fotos = imagenesDePdf(bytes);
    if (fotos.length) return { texto: `${TEXTO_ESCANEADO}; ${van(fotos.length, '')}`, imagenes: fotos.map((i) => ({ mimeType: i.mimeType, base64: aBase64(i.bytes) })) };
  }
  // Fotos JPEG 2000: se pasan a píxeles crudos antes de dibujar (pdf-imagenes.ts).
  const paginas = await Promise.resolve().then(() => paginasComoImagenes(pdfSinJpx(bytes) ?? bytes)).catch(() => []);
  if (paginas.length) {
    return {
      texto: `${sinTexto ? TEXTO_DIBUJADO : TEXTO_ILEGIBLE}; ${van(paginas.length, ' de sus páginas')}`,
      imagenes: paginas.map((p) => ({ mimeType: p.mimeType, base64: aBase64(p.bytes) })),
    };
  }
  return { texto: `${SIN_CONTENIDO}: abrilo vos en el link)` };
}

// Cómo llegó un documento al modelo, para que doctor lo cuente.
export type Llegada = 'texto' | 'imagen' | 'link';
export function comoLlego(d: { texto?: string; imagenes?: unknown[] }): Llegada {
  if (d.imagenes?.length) return 'imagen';
  return d.texto && !d.texto.startsWith(SIN_CONTENIDO) && textoLegible(d.texto) ? 'texto' : 'link';
}
