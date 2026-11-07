// Un solo camino para los documentos de UADE (links de banners y novedades, secciones de WebCampus,
// calendario): texto si se lee; si no, las fotos de un escaneo o las páginas dibujadas; si nada sale,
// un texto que lo dice. Los PDFs se arman acá, mínimos y sintéticos; la imagen es la del banner de prueba.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerArchivo, MAX_BYTES_IMAGEN } from '../src/sources/docs/leer.js';
import { comoLlego, SIN_CONTENIDO, TEXTO_DIBUJADO, TEXTO_ESCANEADO, TEXTO_ILEGIBLE, textoOImagenes } from '../src/sources/docs/legible.js';
import { paginasComoImagenes } from '../src/sources/docs/pdf-paginas.js';
import { pdfSinJpx } from '../src/sources/docs/pdf-imagenes.js';
import { pdfMinimo } from './pdf-minimo.js';

const png = new Uint8Array(readFileSync(new URL('./fixtures/webcampus/banner.png', import.meta.url)));
const ilegible = new Uint8Array(readFileSync(new URL('./fixtures/calendario/cronos_inscrip_previos.pdf', import.meta.url)));
// Un cuadro negro sobre blanco, 240 × 240, en JPEG 2000 RGB (hecho con sips; sin datos de nadie).
const jp2 = readFileSync(new URL('./fixtures/docs/cuadro.jp2', import.meta.url));
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);

describe('textoOImagenes', () => {
  it('texto legible: el texto, sin imágenes', async () => {
    const r = await textoOImagenes('Requisitos para promocionar: 7 en cada parcial.', pdfMinimo(''));
    expect(r).toEqual({ texto: 'Requisitos para promocionar: 7 en cada parcial.' });
    expect(comoLlego(r)).toBe('texto');
  });

  it('códigos de control (fuentes sin mapa de caracteres): las páginas dibujadas, no la basura', async () => {
    const r = await textoOImagenes('\u001f\u001e\u001d\u001c \u001b\u001a\u0019', ilegible);
    expect(r.texto.startsWith(TEXTO_ILEGIBLE)).toBe(true);
    expect(r.texto).not.toMatch(/[\u0000-\u0008\u000e-\u001f]/);
    expect(r.imagenes).toHaveLength(1);
    expect(comoLlego(r)).toBe('imagen');
  });

  it('sin texto y con una foto (escaneo): la foto tal cual', async () => {
    const r = await textoOImagenes('', pdfMinimo('q 200 0 0 200 0 0 cm /Im1 Do Q', jpeg));
    expect(r.texto.startsWith(TEXTO_ESCANEADO)).toBe(true);
    expect(r.imagenes).toEqual([{ mimeType: 'image/jpeg', base64: jpeg.toString('base64') }]);
  });

  it('sin texto ni fotos, con trazos (como emergencias): la página dibujada', async () => {
    const r = await textoOImagenes('', pdfMinimo('0 0 0 rg 20 20 160 40 re f'));
    expect(r.texto.startsWith(TEXTO_DIBUJADO)).toBe(true);
    expect(r.imagenes).toHaveLength(1);
    expect(r.imagenes![0]!.mimeType).toBe('image/png');
  });

  it('fotos JPEG 2000 (como requisitos de promociones): se decodifican y la página se dibuja con ellas', async () => {
    const pdf = pdfMinimo('q 200 0 0 200 0 0 cm /Im1 Do Q', jp2, { filtro: 'JPXDecode', lado: 240 });
    const convertido = pdfSinJpx(pdf)!;
    expect(Buffer.from(convertido).toString('latin1')).toMatch(/\/Width 240\/Height 240\/ColorSpace\/DeviceRGB\/BitsPerComponent 8\/Filter\/FlateDecode/);
    expect(Buffer.from(convertido).toString('latin1')).not.toContain('JPXDecode');
    const r = await textoOImagenes('', pdf);
    expect(r.texto.startsWith(TEXTO_DIBUJADO)).toBe(true);
    expect(r.imagenes).toHaveLength(1);
    expect(await paginasComoImagenes(pdf)).toEqual([]); // sin convertir, pdf.js la dibuja en blanco
    expect(pdfSinJpx(pdfMinimo('0 0 0 rg 20 20 160 40 re f'))).toBeNull();
    expect(pdfSinJpx(pdfMinimo('', Buffer.from('basura'), { filtro: 'JPXDecode', lado: 240 }))).toBeNull(); // no se puede decodificar: queda igual
  });

  it('una página que sale toda blanca no se manda: queda el aviso para dar el link', async () => {
    expect(await paginasComoImagenes(pdfMinimo(''))).toEqual([]);
    const r = await textoOImagenes('', pdfMinimo(''));
    expect(r).toEqual({ texto: `${SIN_CONTENIDO}: abrilo vos en el link)` });
    expect(comoLlego(r)).toBe('link');
  });
});

describe('leerArchivo', () => {
  it('una imagen va como imagen; si pasa el tope, texto que lo dice', async () => {
    const r = await leerArchivo('aviso', png);
    expect(r.imagenes).toEqual([{ mimeType: 'image/png', base64: Buffer.from(png).toString('base64') }]);
    const grande = new Uint8Array(MAX_BYTES_IMAGEN + 1);
    grande.set(png.subarray(0, 8));
    expect(await leerArchivo('aviso.png', grande)).toEqual({ texto: expect.stringContaining('tope de 1,5 MB') });
  });

  it('un PDF sin extensión en el nombre se reconoce por sus primeros bytes y pasa por textoOImagenes', async () => {
    const r = await leerArchivo('Requisitos', pdfMinimo('0 0 0 rg 20 20 160 40 re f'));
    expect(r.texto.startsWith(TEXTO_DIBUJADO)).toBe(true);
    expect(r.imagenes).toHaveLength(1);
  });

  it('texto plano sin extensión: su texto', async () => {
    expect(await leerArchivo('cualquiera', new TextEncoder().encode('texto plano'))).toEqual({ texto: 'texto plano' });
  });
});

describe('doctor: resumenDocumentos', () => {
  it('cuenta texto, imagen y solo link; avisa con los nombres de los que quedaron sin contenido', async () => {
    const { resumenDocumentos } = await import('../src/cli/doctor.js');
    expect(resumenDocumentos([
      { nombre: 'normas.pdf', texto: 'Artículo 1: la asistencia mínima es del 75 %.' },
      { nombre: 'emergencia.pdf', texto: `${TEXTO_DIBUJADO}; van 2 imágenes)`, imagenes: [{}, {}] },
      { nombre: 'promo.pdf', texto: `${SIN_CONTENIDO}: abrilo vos en el link)` },
      { nombre: 'roto.pdf' },
    ])).toEqual(['aviso', '4 documentos: 1 como texto, 1 como imagen, 2 solo link; sin contenido: promo.pdf, roto.pdf']);
    expect(resumenDocumentos([{ nombre: 'a.pdf', texto: 'Texto legible del documento.' }])).toEqual(['ok', '1 documento: 1 como texto, 0 como imagen, 0 solo link']);
  });
});
