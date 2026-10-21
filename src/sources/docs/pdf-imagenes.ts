// Imágenes de un PDF escaneado (sin texto), para que el modelo las mire: algunos documentos de
// UADE (números ante emergencias, algunos cronogramas) son una foto pegada en un PDF. No se
// renderiza la página (eso pediría un motor gráfico): se sacan las imágenes tal como están
// guardadas. JPEG (DCTDecode) sale como está; las de píxeles crudos (FlateDecode, 8 bits, gris,
// RGB o paleta) se envuelven en un PNG con zlib. Los escáneres suelen cortar la hoja en tiras del
// mismo ancho: las tiras consecutivas se pegan en una sola imagen.
import { deflateSync, inflateSync } from 'node:zlib';

export interface ImagenPdf {
  mimeType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
  ancho: number;
  alto: number;
}

interface Cruda {
  ancho: number;
  alto: number;
  rgb: Uint8Array; // 3 bytes por píxel
}

const MAX_IMAGENES = 6;
const MIN_LADO = 200; // íconos y logos chicos no sirven para leer nada
const MAX_PIXELES = 30_000_000;

export function imagenesDePdf(bytes: Uint8Array, max = MAX_IMAGENES): ImagenPdf[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = buf.toString('latin1');
  const out: ImagenPdf[] = [];
  let tiras: Cruda[] = [];
  const cerrarTiras = () => {
    if (tiras.length) out.push(pngDe(pegar(tiras)));
    tiras = [];
  };
  // Las máscaras de transparencia (/SMask N 0 R) son imágenes aparte que no hay que mostrar.
  const mascaras = new Set([...s.matchAll(/\/SMask\s+(\d+) 0 R/g)].map((x) => x[1]));
  // El diccionario de un objeto termina en ">> stream"; "(?!endobj)" evita saltar al objeto siguiente.
  const re = /(\d+) 0 obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && out.length + (tiras.length ? 1 : 0) < max) {
    const dict = m[2]!;
    // Una imagen con su propia máscara (/SMask) es un gráfico compuesto (fondos de un diseño, no un
    // escaneo): sola, sin la máscara, se vería como una mancha de color. Se saltea.
    if (!/\/Subtype\s*\/Image\b/.test(dict) || /\/ImageMask\s+true/.test(dict) || /\/SMask\s+\d+ 0 R/.test(dict) || mascaras.has(m[1]!)) continue;
    const ancho = num(dict, 'Width'), alto = num(dict, 'Height'), largo = num(dict, 'Length');
    if (!ancho || !alto || !largo || ancho < MIN_LADO || alto < 50 || ancho * alto > MAX_PIXELES) continue;
    const inicio = m.index + m[0].length;
    const datos = buf.subarray(inicio, inicio + largo);
    const filtro = dict.match(/\/Filter\s*\[?\s*\/(\w+)/)?.[1];
    if (filtro === 'DCTDecode') {
      cerrarTiras();
      if (datos[0] === 0xff && datos[1] === 0xd8) out.push({ mimeType: 'image/jpeg', bytes: new Uint8Array(datos), ancho, alto });
      continue;
    }
    if (filtro !== 'FlateDecode' || num(dict, 'BitsPerComponent') !== 8) continue;
    const cs = colorSpace(dict, s);
    if (!cs) continue;
    let raw: Buffer;
    try { raw = inflateSync(datos); } catch { continue; }
    const cruda = aRgb(raw, ancho, alto, cs);
    if (!cruda) continue;
    if (tiras.length && tiras[0]!.ancho !== ancho) cerrarTiras();
    tiras.push(cruda);
  }
  cerrarTiras();
  return out.slice(0, max);
}

const num = (dict: string, clave: string): number => Number(dict.match(new RegExp(`/${clave}\\s+(\\d+)`))?.[1] ?? 0);

type ColorSpace = { tipo: 'gris' } | { tipo: 'rgb' } | { tipo: 'paleta'; tabla: Buffer };

function colorSpace(dict: string, pdf: string): ColorSpace | null {
  let cs = dict.match(/\/ColorSpace\s*(\/\w+|\[[^\]]*\]|\d+ 0 R)/)?.[1] ?? '';
  if (/^\d+ 0 R$/.test(cs)) cs = objeto(pdf, cs) ?? '';
  if (/^\/DeviceGray|^\/CalGray/.test(cs)) return { tipo: 'gris' };
  if (/^\/DeviceRGB|^\/CalRGB/.test(cs)) return { tipo: 'rgb' };
  const idx = cs.match(/^\[\s*\/Indexed\s*\/(\w+)\s+(\d+)\s+(<[0-9a-fA-F\s]*>|\d+ 0 R)/);
  if (!idx || idx[1] !== 'DeviceRGB') return null;
  const tabla = idx[3]!.startsWith('<') ? Buffer.from(idx[3]!.replace(/[<>\s]/g, ''), 'hex') : streamDe(pdf, idx[3]!);
  return tabla ? { tipo: 'paleta', tabla } : null;
}

// Cuerpo (sin stream) de "N 0 obj".
function objeto(pdf: string, ref: string): string | null {
  const n = ref.split(' ')[0];
  const m = pdf.match(new RegExp(`(?<![0-9])${n} 0 obj\\s*([\\s\\S]*?)\\s*(?:stream|endobj)`));
  return m ? m[1]!.trim() : null;
}

function streamDe(pdf: string, ref: string): Buffer | null {
  const n = ref.split(' ')[0];
  const m = pdf.match(new RegExp(`(?<![0-9])${n} 0 obj\\s*<<((?:(?!endobj)[\\s\\S])*?)>>\\s*stream\\r?\\n`));
  if (!m) return null;
  const largo = num(m[1]!, 'Length');
  const datos = Buffer.from(pdf.slice(m.index! + m[0].length, m.index! + m[0].length + largo), 'latin1');
  if (!/\/FlateDecode/.test(m[1]!)) return datos;
  try { return inflateSync(datos); } catch { return null; }
}

function aRgb(raw: Buffer, ancho: number, alto: number, cs: ColorSpace): Cruda | null {
  const px = ancho * alto;
  const rgb = Buffer.alloc(px * 3);
  if (cs.tipo === 'rgb') {
    if (raw.length < px * 3) return null;
    raw.copy(rgb, 0, 0, px * 3);
  } else if (cs.tipo === 'gris') {
    if (raw.length < px) return null;
    for (let i = 0; i < px; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = raw[i]!;
  } else {
    if (raw.length < px) return null;
    const t = cs.tabla;
    for (let i = 0; i < px; i++) {
      const k = Math.min(raw[i]!, t.length / 3 - 1) * 3;
      rgb[i * 3] = t[k] ?? 0; rgb[i * 3 + 1] = t[k + 1] ?? 0; rgb[i * 3 + 2] = t[k + 2] ?? 0;
    }
  }
  return { ancho, alto, rgb };
}

function pegar(tiras: Cruda[]): Cruda {
  if (tiras.length === 1) return tiras[0]!;
  const ancho = tiras[0]!.ancho;
  const alto = tiras.reduce((n, t) => n + t.alto, 0);
  return { ancho, alto, rgb: Buffer.concat(tiras.map((t) => t.rgb)) };
}

// PNG mínimo: cabecera, IHDR (RGB 8 bits), un IDAT con las filas (filtro 0) y IEND.
export function pngDe(img: Cruda): ImagenPdf {
  const filas = Buffer.alloc((img.ancho * 3 + 1) * img.alto);
  for (let y = 0; y < img.alto; y++) {
    const o = y * (img.ancho * 3 + 1);
    filas[o] = 0;
    Buffer.from(img.rgb.buffer, img.rgb.byteOffset + y * img.ancho * 3, img.ancho * 3).copy(filas, o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.ancho, 0); ihdr.writeUInt32BE(img.alto, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return { mimeType: 'image/png', bytes: new Uint8Array(png), ancho: img.ancho, alto: img.alto };
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([len, cuerpo, crc]);
}

let TABLA_CRC: Uint32Array | null = null;
function crc32(b: Buffer): number {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const aBase64 = (b: Uint8Array): string => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64');
