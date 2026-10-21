// Imágenes de un PDF escaneado: JPEG tal cual, píxeles crudos a PNG, tiras pegadas; máscaras y
// gráficos compuestos (con SMask) se saltean. Los PDFs se arman acá mismo, mínimos y sintéticos.
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { imagenesDePdf } from '../src/sources/docs/pdf-imagenes.js';

const obj = (n: number, dict: string, datos: Buffer) => Buffer.concat([Buffer.from(`${n} 0 obj\n<<${dict}/Length ${datos.length}>>\nstream\n`, 'latin1'), datos, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
const pdf = (...partes: Buffer[]) => new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.4\n'), ...partes, Buffer.from('%%EOF')]));
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const W = 300, H = 60;
const gris = (v: number) => deflateSync(Buffer.alloc(W * H, v));

function pixelesDelPng(png: Uint8Array): { ancho: number; alto: number; filas: Buffer } {
  const b = Buffer.from(png);
  expect(b.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ancho = b.readUInt32BE(16), alto = b.readUInt32BE(20);
  const idat = b.indexOf('IDAT') + 4;
  const len = b.readUInt32BE(idat - 8);
  return { ancho, alto, filas: inflateSync(b.subarray(idat, idat + len)) };
}

describe('imágenes de un PDF', () => {
  it('JPEG sale tal cual; una imagen chica (ícono) se ignora', () => {
    const doc = pdf(obj(1, `/Type/XObject/Subtype/Image/Width ${W}/Height ${H}/Filter/DCTDecode/ColorSpace/DeviceRGB/BitsPerComponent 8`, jpeg), obj(2, '/Subtype/Image/Width 40/Height 40/Filter/DCTDecode', jpeg));
    const r = imagenesDePdf(doc);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mimeType: 'image/jpeg', ancho: W, alto: H });
    expect(Buffer.from(r[0]!.bytes)).toEqual(jpeg);
  });

  it('tiras grises consecutivas se pegan en un PNG RGB; una paleta se resuelve', () => {
    const d1 = gris(0), d2 = gris(255);
    const paleta = Buffer.from([0, 0, 0, 255, 0, 0]); // índice 1 = rojo
    const d3 = deflateSync(Buffer.alloc(W * H, 1));
    const doc = pdf(
      obj(1, `/Subtype/Image/Width ${W}/Height ${H}/Filter/FlateDecode/ColorSpace/DeviceGray/BitsPerComponent 8`, d1),
      obj(2, `/Subtype/Image/Width ${W}/Height ${H}/Filter/FlateDecode/ColorSpace/DeviceGray/BitsPerComponent 8`, d2),
      obj(3, `/Subtype/Image/Width ${W}/Height ${H}/Filter/FlateDecode/ColorSpace[/Indexed/DeviceRGB 1 <${paleta.toString('hex')}>]/BitsPerComponent 8`, d3),
    );
    const r = imagenesDePdf(doc);
    expect(r).toHaveLength(1);
    const { ancho, alto, filas } = pixelesDelPng(r[0]!.bytes);
    expect([ancho, alto]).toEqual([W, H * 3]);
    const fila = (y: number) => filas.subarray(y * (W * 3 + 1) + 1, y * (W * 3 + 1) + 4);
    expect([...fila(0)]).toEqual([0, 0, 0]);
    expect([...fila(H)]).toEqual([255, 255, 255]);
    expect([...fila(2 * H)]).toEqual([255, 0, 0]);
  });

  it('máscaras y gráficos compuestos (SMask) no se devuelven; el diccionario no salta de objeto', () => {
    const doc = pdf(
      Buffer.from('5 0 obj\n<</Type/ExtGState/SMask/None>>\nendobj\n'),
      obj(6, `/Subtype/Image/Width ${W}/Height ${H}/Filter/DCTDecode/ColorSpace/DeviceGray/BitsPerComponent 8`, jpeg), // máscara de 7
      obj(7, `/Subtype/Image/Width ${W}/Height ${H}/Filter/FlateDecode/ColorSpace/DeviceGray/BitsPerComponent 8/SMask 6 0 R`, gris(9)),
      obj(8, `/Subtype/Image/Width ${W}/Height ${H}/Filter/DCTDecode/ColorSpace/DeviceRGB/BitsPerComponent 8`, jpeg),
    );
    const r = imagenesDePdf(doc);
    expect(r.map((i) => i.mimeType)).toEqual(['image/jpeg']);
  });

  it('un PDF sin imágenes (texto vectorial) devuelve vacío', () => {
    expect(imagenesDePdf(pdf(obj(1, '/Filter/FlateDecode', deflateSync(Buffer.from('BT /F1 12 Tf (hola) Tj ET')))))).toEqual([]);
  });

  it('un stream chico que infla a cientos de MB se corta (tope por imagen), sin tirar', () => {
    // Declara 300x60 gris (18 KB) pero el zlib trae 40 MB: se descarta sin reservar esa memoria.
    const bomba = deflateSync(Buffer.alloc(40 * 1024 * 1024, 7));
    expect(bomba.length).toBeLessThan(100_000);
    const doc = pdf(
      obj(1, `/Subtype/Image/Width ${W}/Height ${H}/Filter/FlateDecode/ColorSpace/DeviceGray/BitsPerComponent 8`, bomba),
      obj(2, `/Subtype/Image/Width ${W}/Height ${H}/Filter/DCTDecode/ColorSpace/DeviceRGB/BitsPerComponent 8`, jpeg),
    );
    const r = imagenesDePdf(doc);
    expect(r.map((i) => i.mimeType)).toEqual(['image/jpeg']);
  });

  it('un PDF hostil con miles de "N 0 obj <<" sin cerrar se recorre en tiempo lineal (< 1 s)', () => {
    const hostil = pdf(Buffer.from('1 0 obj <</Subtype/Image '.repeat(60_000)), obj(2, `/Subtype/Image/Width ${W}/Height ${H}/Filter/DCTDecode`, jpeg));
    expect(hostil.length).toBeGreaterThan(1_400_000);
    const t0 = performance.now();
    const r = imagenesDePdf(hostil);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.length).toBeLessThanOrEqual(1);
  });

  it('un diccionario anidado (DecodeParms) no corta el objeto antes de tiempo', () => {
    const doc = pdf(obj(1, `/Subtype/Image/Width ${W}/Height ${H}/DecodeParms<</Predictor 1/Colors 3>>/Filter/DCTDecode/ColorSpace/DeviceRGB/BitsPerComponent 8`, jpeg));
    expect(imagenesDePdf(doc).map((i) => i.mimeType)).toEqual(['image/jpeg']);
  });
});
