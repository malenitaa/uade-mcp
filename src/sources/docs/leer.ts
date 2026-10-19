// Extrae el texto de un documento (PDF, Word, Excel, PowerPoint) ya descargado, para que el agente
// lo lea sin que la persona lo suba. Todo en memoria, con las librerías que ya están. Los .doc/.xls
// viejos (binarios) no se pueden leer: en ese caso se sugiere guardar el archivo.
import { Unzip, UnzipInflate } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import { leerPdf } from '../calendario/index.js';

const MAX_TEXTO = 12000;

export function tipoLegible(nombre: string): boolean {
  return /\.(pdf|xlsx|docx|pptx|txt|csv|md)$/i.test(nombre);
}

// Lee archivos de un zip (docx/pptx/xlsx) cuyo nombre matchea `filtro`, concatenando su contenido.
function partesDeZip(bytes: Uint8Array, filtro: RegExp): string[] {
  const partes: { nombre: string; data: Uint8Array }[] = [];
  const unzip = new Unzip((file) => {
    if (!filtro.test(file.name)) return; // no se arranca: fflate lo saltea
    const trozos: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
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
    const rows = await readSheet(Buffer.from(bytes));
    texto = rows.map((r) => r.map((c) => (c == null ? '' : String(c))).join('\t')).join('\n');
  } else {
    throw new Error(`No puedo leer el texto de un ".${ext}" (formato viejo o binario). Pedí guardarlo en Descargas.`);
  }
  texto = texto.replace(/\u0000/g, '').trim();
  return texto.length > MAX_TEXTO ? { texto: texto.slice(0, MAX_TEXTO), recortado: true } : { texto, recortado: false };
}
