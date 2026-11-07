// Extrae el texto de un documento ya descargado (PDF, Word .docx/.doc, Excel .xlsx/.xls,
// PowerPoint .pptx), para que el agente lo lea sin que la persona lo suba ni use la terminal.
// Todo en memoria. Los Casos de UADE suelen venir en .doc/.xls viejos, por eso se soportan.
import { Unzip, UnzipInflate } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import WordExtractor from 'word-extractor';
import { read as leerXls, utils as xlsUtils } from 'xlsx';
import { leerPdf } from '../calendario/index.js';
import { assertXlsxRazonable, MAX_DESCOMPRIMIDO } from '../webcampus/previos.js';
import { ErrorDeUso } from '../../error-de-uso.js';
import { textoOImagenes, type PdfLegible } from './legible.js';
import { aBase64 } from './pdf-imagenes.js';

const MAX_TEXTO = 12000;

export function tipoLegible(nombre: string): boolean {
  return /\.(pdf|xlsx|xls|docx|doc|pptx|txt|csv|md)$/i.test(nombre);
}

// Lee archivos de un zip (docx/pptx) cuyo nombre matchea `filtro`, concatenando su contenido.
// Cuenta los bytes REALES que salen (los tamaños que declara el zip se pueden falsear) y corta al
// pasar el tope: un "zip bomb" disfrazado de apunte no agota la memoria.
function partesDeZip(bytes: Uint8Array, filtro: RegExp): string[] {
  const partes: { nombre: string; data: Uint8Array }[] = [];
  let total = 0;
  const unzip = new Unzip((file) => {
    if (!filtro.test(file.name)) return; // no se arranca: fflate lo saltea
    const trozos: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      total += chunk.length;
      if (total > MAX_DESCOMPRIMIDO) throw new Error('El documento es sospechosamente grande al descomprimirlo; no se abrió.');
      trozos.push(chunk);
      if (final) {
        const total = trozos.reduce((n, c) => n + c.length, 0);
        const buf = new Uint8Array(total);
        let off = 0;
        for (const c of trozos) { buf.set(c, off); off += c.length; }
        partes.push({ nombre: file.name, data: buf });
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(bytes, true);
  // slideN.xml en orden numérico; document.xml es único.
  partes.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
  return partes.map((p) => new TextDecoder().decode(p.data));
}

function textoDeXml(xml: string, tag: 'w:t' | 'a:t'): string {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g');
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(m[1]!);
  // Párrafos: un salto por cada <w:p>/<a:p> cerrado.
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export async function leerDocumento(nombre: string, bytes: Uint8Array): Promise<{ texto: string; recortado: boolean }> {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  let texto = '';
  if (ext === 'pdf') texto = (await leerPdf(bytes)).texto;
  else if (ext === 'txt' || ext === 'csv' || ext === 'md') texto = new TextDecoder().decode(bytes);
  else if (ext === 'docx') texto = partesDeZip(bytes, /^word\/document\.xml$/).map((x) => textoDeXml(x, 'w:t')).join('\n');
  else if (ext === 'pptx') {
    const slides = partesDeZip(bytes, /^ppt\/slides\/slide\d+\.xml$/);
    texto = slides.map((x, i) => `[Diapositiva ${i + 1}] ${textoDeXml(x, 'a:t')}`).join('\n');
  } else if (ext === 'xlsx') {
    assertXlsxRazonable(bytes, 'El Excel');
    const rows = await readSheet(Buffer.from(bytes));
    texto = rows.map((r) => r.map((c) => (c == null ? '' : String(c))).join('\t')).join('\n');
  } else if (ext === 'doc') {
    const doc = await new WordExtractor().extract(Buffer.from(bytes));
    texto = doc.getBody();
  } else if (ext === 'xls') {
    const libro = leerXls(bytes, { type: 'array' });
    texto = libro.SheetNames.map((n) => `[Hoja ${n}]\n${xlsUtils.sheet_to_csv(libro.Sheets[n]!, { FS: '\t' })}`).join('\n');
  } else {
    throw new Error(`No puedo leer el texto de un ".${ext}". Pedí guardarlo en Descargas.`);
  }
  texto = texto.replace(/\u0000/g, '').trim();
  return texto.length > MAX_TEXTO ? { texto: texto.slice(0, MAX_TEXTO), recortado: true } : { texto, recortado: false };
}

// Una imagen suelta (un link o un aviso que es solo una foto) va al modelo tal cual, con el mismo
// tope que los banners del home.
export const MAX_BYTES_IMAGEN = 1.5 * 1024 * 1024;

export function tipoDeImagen(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// Un solo punto para leer un documento bajado de UADE (link de un banner o una novedad, sección de
// WebCampus): imagen → la imagen; PDF → texto si se lee, si no imágenes (textoOImagenes); otros
// formatos → su texto. El tipo sale del nombre o, si no tiene extensión conocida, de los primeros bytes.
export async function leerArchivo(nombre: string, bytes: Uint8Array): Promise<PdfLegible & { recortado?: boolean }> {
  const mime = tipoDeImagen(bytes);
  if (mime) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1).replace('.', ',');
    return bytes.length > MAX_BYTES_IMAGEN
      ? { texto: `(Es una imagen de ${mb} MB, más que el tope de 1,5 MB: abrila vos en el link)` }
      : { texto: '(Es una imagen: va para que la leas)', imagenes: [{ mimeType: mime, base64: aBase64(bytes) }] };
  }
  const esPdf = bytes[0] === 0x25 && bytes[1] === 0x50; // "%P"
  if (esPdf || /\.pdf$/i.test(nombre)) {
    const { texto, recortado } = await leerDocumento('archivo.pdf', bytes).catch((err: Error) => { throw new ErrorDeUso(`No pude leer ${nombre}: ${err.message}`); });
    return { ...(await textoOImagenes(texto, bytes)), ...(recortado ? { recortado } : {}) };
  }
  const candidatos = tipoLegible(nombre) ? [nombre] : bytes[0] === 0x50 && bytes[1] === 0x4b ? ['archivo.xlsx', 'archivo.docx', 'archivo.pptx'] : ['archivo.txt'];
  let ultimo = '';
  for (const c of candidatos) {
    try {
      const r = await leerDocumento(c, bytes);
      if (r.texto.trim()) return r.recortado ? r : { texto: r.texto };
    } catch (err) {
      ultimo = (err as Error).message;
    }
  }
  throw new ErrorDeUso(`No pude leer ${nombre}${ultimo ? `: ${ultimo}` : ''}.`);
}
