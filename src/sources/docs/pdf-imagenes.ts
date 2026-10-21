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
// 20 megapíxeles en RGB son 60 MB crudos: el mismo tope que los demás formatos (SECURITY.md).
const MAX_PIXELES = 20_000_000;
export const MAX_CRUDO = 60 * 1024 * 1024; // bytes descomprimidos por PDF, entre todas sus imágenes
const MAX_OBJETOS = 20_000; // objetos revisados por PDF
const MAX_DICT = 4096; // un diccionario de imagen mide unas decenas de bytes; más es otra cosa

// Un objeto "N 0 obj << … >> stream\n" con su diccionario y dónde empiezan sus datos.
interface ObjetoStream {
  n: string;
  dict: string;
  inicio: number;
}

// Recorre el PDF objeto por objeto con indexOf y un diccionario acotado: lineal en el tamaño del
// archivo, aunque el PDF esté armado a propósito con miles de "N 0 obj <<" sin cerrar.
function* objetosConStream(s: string): Generator<ObjetoStream> {
  let pos = 0;
  for (let vistos = 0; vistos < MAX_OBJETOS; vistos++) {
    const i = s.indexOf(' 0 obj', pos);
    if (i < 0) return;
    pos = i + 6;
    // Número del objeto: los dígitos justo antes de " 0 obj", y antes de ellos nada que sea un dígito.
    let d = i;
    while (d > 0 && s.charCodeAt(d - 1) >= 48 && s.charCodeAt(d - 1) <= 57) d--;
    if (d === i) continue;
    const n = s.slice(d, i);
    let j = saltarBlancos(s, pos);
    if (s.startsWith('<<', j)) {
      const fin = finDeDiccionario(s, j);
      if (fin < 0) continue;
      const dict = s.slice(j + 2, fin - 2);
      j = saltarBlancos(s, fin);
      if (!s.startsWith('stream', j)) continue;
      j += 6;
      if (s[j] === '\r') j++;
      if (s[j] !== '\n') continue;
      yield { n, dict, inicio: j + 1 };
    }
  }
}

function saltarBlancos(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return i;
}

// Índice justo después del ">>" que cierra el diccionario que empieza en `i` (anidados incluidos),
// o -1 si no cierra dentro del tope.
function finDeDiccionario(s: string, i: number): number {
  const tope = Math.min(s.length, i + MAX_DICT);
  let prof = 0;
  for (let k = i; k < tope - 1; k++) {
    if (s[k] === '<' && s[k + 1] === '<') { prof++; k++; }
    else if (s[k] === '>' && s[k + 1] === '>') { prof--; k++; if (prof === 0) return k + 1; }
  }
  return -1;
}

export function imagenesDePdf(bytes: Uint8Array, max = MAX_IMAGENES): ImagenPdf[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = buf.toString('latin1');
  const out: ImagenPdf[] = [];
  let tiras: Cruda[] = [];
  let presupuesto = MAX_CRUDO;
  const cerrarTiras = () => {
    if (tiras.length) out.push(pngDe(pegar(tiras)));
    tiras = [];
  };
  // Las máscaras de transparencia (/SMask N 0 R) son imágenes aparte que no hay que mostrar.
  const mascaras = new Set([...s.matchAll(/\/SMask\s+(\d+) 0 R/g)].map((x) => x[1]));
  for (const { n, dict, inicio } of objetosConStream(s)) {
    if (out.length + (tiras.length ? 1 : 0) >= max) break;
    // Una imagen con su propia máscara (/SMask) es un gráfico compuesto (fondos de un diseño, no un
    // escaneo): sola, sin la máscara, se vería como una mancha de color. Se saltea.
    if (!/\/Subtype\s*\/Image\b/.test(dict) || /\/ImageMask\s+true/.test(dict) || /\/SMask\s+\d+ 0 R/.test(dict) || mascaras.has(n)) continue;
    const ancho = num(dict, 'Width'), alto = num(dict, 'Height'), largo = num(dict, 'Length');
    if (!ancho || !alto || !largo || ancho < MIN_LADO || alto < 50 || ancho * alto > MAX_PIXELES) continue;
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
    // Tope de salida: lo que mide la imagen declarada (y nunca más que el presupuesto del PDF). Un
    // stream chico que infla a cientos de MB corta acá, sin reservar memoria.
    const esperado = ancho * alto * (cs.tipo === 'rgb' ? 3 : 1);
    if (esperado > presupuesto) break;
    let raw: Buffer;
    try { raw = inflateSync(datos, { maxOutputLength: esperado + 1024 }); } catch { continue; }
    presupuesto -= raw.length;
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

// Objeto "N 0 obj" (el primero con ese número), con su diccionario si lo tiene, por indexOf.
function buscarObjeto(pdf: string, n: string): { dict: string | null; cuerpo: string; inicioStream: number } | null {
  let pos = 0;
  for (let intentos = 0; intentos < 100; intentos++) {
    const i = pdf.indexOf(`${n} 0 obj`, pos);
    if (i < 0) return null;
    pos = i + 1;
    if (i > 0 && /\d/.test(pdf[i - 1]!)) continue;
    const j = saltarBlancos(pdf, i + n.length + 6);
    if (pdf.startsWith('<<', j)) {
      const fin = finDeDiccionario(pdf, j);
      if (fin < 0) return null;
      let k = saltarBlancos(pdf, fin);
      const dict = pdf.slice(j + 2, fin - 2);
      if (!pdf.startsWith('stream', k)) return { dict, cuerpo: dict, inicioStream: -1 };
      k += 6;
      if (pdf[k] === '\r') k++;
      return pdf[k] === '\n' ? { dict, cuerpo: dict, inicioStream: k + 1 } : null;
    }
    // Sin diccionario (un array de ColorSpace, por ejemplo): el cuerpo hasta endobj, acotado.
    const fin = pdf.indexOf('endobj', j);
    return { dict: null, cuerpo: pdf.slice(j, fin < 0 ? Math.min(pdf.length, j + MAX_DICT) : Math.min(fin, j + MAX_DICT)).trim(), inicioStream: -1 };
  }
  return null;
}

// Cuerpo (sin stream) de "N 0 obj".
function objeto(pdf: string, ref: string): string | null {
  return buscarObjeto(pdf, ref.split(' ')[0]!)?.cuerpo ?? null;
}

const MAX_PALETA = 256 * 3 + 64; // una tabla /Indexed de 8 bits tiene a lo sumo 256 colores RGB

function streamDe(pdf: string, ref: string): Buffer | null {
  const o = buscarObjeto(pdf, ref.split(' ')[0]!);
  if (!o || !o.dict || o.inicioStream < 0) return null;
  const largo = Math.min(num(o.dict, 'Length'), MAX_DICT * 4);
  const datos = Buffer.from(pdf.slice(o.inicioStream, o.inicioStream + largo), 'latin1');
  if (!/\/FlateDecode/.test(o.dict)) return datos.subarray(0, MAX_PALETA);
  try { return inflateSync(datos, { maxOutputLength: MAX_PALETA }); } catch { return null; }
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
