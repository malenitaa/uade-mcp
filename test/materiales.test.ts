import { strFromU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { leerDocumento, tipoLegible } from '../src/sources/docs/leer.js';
import { SITIOS_PERMITIDOS } from '../src/sources/sharepoint/index.js';

const permite = (p: string) => SITIOS_PERMITIDOS.some((r) => r.test(p));

describe('permisos de SharePoint', () => {
  it('solo aranceles y "Materiales de clase"/"Class Materials"', () => {
    expect(permite('/sites/Section_577511/Materiales de clase/Casos/x.pdf')).toBe(true);
    expect(permite('/sites/17-FAIN/Class Materials/CLASE 1/t.pptx')).toBe(true);
    expect(permite('/sites/ArchivosAranceles/x.pdf')).toBe(true);
    expect(permite('/sites/Section_577511/Documentos compartidos/x.mp4')).toBe(false);
    expect(permite('/personal/alguien/Documents/x.docx')).toBe(false);
  });
});

describe('leer documentos', () => {
  it('docx: saca el texto de los <w:t>', async () => {
    const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Hola</w:t></w:r><w:r><w:t xml:space="preserve"> mundo</w:t></w:r></w:p></w:body></w:document>';
    const zip = zipSync({ 'word/document.xml': new TextEncoder().encode(xml), '[Content_Types].xml': new Uint8Array() });
    expect((await leerDocumento('tp.docx', zip)).texto).toBe('Hola mundo');
  });

  it('pptx: numera las diapositivas y saca los <a:t>', async () => {
    const slide = (t: string) => new TextEncoder().encode(`<p:sld><a:t>${t}</a:t></p:sld>`);
    const zip = zipSync({ 'ppt/slides/slide1.xml': slide('Intro'), 'ppt/slides/slide2.xml': slide('Costos') });
    const { texto } = await leerDocumento('teoria.pptx', zip);
    expect(texto).toContain('[Diapositiva 1] Intro');
    expect(texto).toContain('[Diapositiva 2] Costos');
  });

  it('xlsx: devuelve las celdas', async () => {
    const buf: Buffer = await (writeXlsxFile([[{ value: 'Concepto' }, { value: 'Monto' }], [{ value: 'Cuota' }, { value: 100, type: Number }]] as never) as unknown as { toBuffer(): Promise<Buffer> }).toBuffer();
    const { texto } = await leerDocumento('costos.xlsx', new Uint8Array(buf));
    expect(texto).toContain('Concepto');
    expect(texto).toContain('Cuota');
  });

  it('xls viejo: devuelve las celdas por hoja', async () => {
    const { utils, write } = await import('xlsx');
    const libro = utils.book_new();
    utils.book_append_sheet(libro, utils.aoa_to_sheet([['Señal', 'Detalle'], [1, 'Equipo cuesta USD 1,1 millón']]), 'Datos Relevantes');
    const bytes = new Uint8Array(write(libro, { type: 'array', bookType: 'xls' }));
    const { texto } = await leerDocumento('caso.xls', bytes);
    expect(texto).toContain('[Hoja Datos Relevantes]');
    expect(texto).toContain('Equipo cuesta USD 1,1 millón');
  });

  it('.doc y .xls viejos cuentan como legibles; un formato no soportado avisa que lo guarde', async () => {
    expect(tipoLegible('caso.doc')).toBe(true);
    expect(tipoLegible('caso.xls')).toBe(true);
    expect(tipoLegible('t.pdf')).toBe(true);
    expect(tipoLegible('nota.rtf')).toBe(false);
    await expect(leerDocumento('nota.rtf', new Uint8Array([1, 2, 3]))).rejects.toThrow('guardarlo en Descargas');
  });
});
