import { strFromU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardarEnSalida, nombreSeguro, segmentoSeguro } from '../src/net/open-browser.js';
import { leerDocumento, tipoLegible } from '../src/sources/docs/leer.js';
import { rutaSana, SITIOS_PERMITIDOS } from '../src/sources/sharepoint/index.js';
import { carpetaDentroDe, MAX_ARCHIVOS_CARPETA, recorrerCarpeta } from '../src/tools/materiales.js';
import type { EntradaSP } from '../src/sources/sharepoint/index.js';

const permite = (p: string) => rutaSana(p) && SITIOS_PERMITIDOS.some((r) => r.test(p));

describe('permisos de SharePoint', () => {
  it('solo aranceles y "Materiales de clase"/"Class Materials"', () => {
    expect(permite('/sites/Section_577511/Materiales de clase/Casos/x.pdf')).toBe(true);
    expect(permite('/sites/17-FAIN/Class Materials/CLASE 1/t.pptx')).toBe(true);
    expect(permite('/sites/ArchivosAranceles/x.pdf')).toBe(true);
    expect(permite('/sites/Section_577511/Documentos compartidos/x.mp4')).toBe(false);
    expect(permite('/personal/alguien/Documents/x.docx')).toBe(false);
  });

  it('las rutas están ancladas al inicio y no aceptan "..": no se sale de la carpeta habilitada', () => {
    expect(permite('/personal/x/sites/Section_1/Materiales de clase/a.pdf')).toBe(false);
    expect(permite('/sites/Section_1/Materiales de clase/../../OtroSitio/a.pdf')).toBe(false);
    expect(permite('/sites/Section_1/Materiales de clase/./a.pdf')).toBe(false);
    expect(permite('/sites/Section_1/Materiales de clase/%2e%2e/secreto.pdf')).toBe(false);
    expect(permite('/sites/Section_1/Materiales de clase/CLASE 4/a.pdf')).toBe(true);
  });

  it('folder se queda debajo de la raíz: sin "..", ".", segmentos vacíos ni barras invertidas', () => {
    const root = '/sites/Section_1/Materiales de clase';
    expect(carpetaDentroDe(root, undefined)).toBe(root);
    expect(carpetaDentroDe(root, '/CLASE 4/')).toBe(`${root}/CLASE 4`);
    expect(carpetaDentroDe(root, 'Casos/2024')).toBe(`${root}/Casos/2024`);
    for (const malo of ['..', '../Documentos compartidos', 'Casos/../..', 'a//b', '.', 'a\\b', '%2e%2e']) {
      expect(() => carpetaDentroDe(root, malo), malo).toThrow('subcarpeta');
    }
  });
});

describe('guardar en Downloads/uade-mcp', () => {
  it('nombre saneado y solo tipos de documento', () => {
    expect(nombreSeguro('../../.ssh/id_rsa.pdf')).toBe('_.._.ssh_id_rsa.pdf');
    expect(nombreSeguro('..\\..\\x.docx')).toBe('_.._x.docx');
    expect(nombreSeguro('  .bashrc.txt')).toBe('bashrc.txt');
    expect(nombreSeguro('clase\u00004.pdf')).toBe('clase4.pdf');
    expect(() => nombreSeguro('.bashrc')).toThrow('ese tipo');
    expect(() => nombreSeguro('script.sh')).toThrow('ese tipo');
    expect(() => nombreSeguro('malo.html')).toThrow('ese tipo');
  });

  it('escribe en Downloads/uade-mcp con modo 600 y no pisa: la segunda copia va con " (2)"', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'));
    const a = await guardarEnSalida('TP 1.pdf', new Uint8Array([1]), home);
    const b = await guardarEnSalida('TP 1.pdf', new Uint8Array([2]), home);
    expect(a).toBe(join(home, 'Downloads', 'uade-mcp', 'TP 1.pdf'));
    expect(b).toBe(join(home, 'Downloads', 'uade-mcp', 'TP 1 (2).pdf'));
    expect(statSync(a).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(home, 'Downloads'))).toEqual(['uade-mcp']); // nada en Downloads directo
  });

  it('una carpeta entera va a Downloads/uade-mcp/<carpeta>/<subcarpeta>, con nombres saneados', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'));
    const a = await guardarEnSalida('t.pdf', new Uint8Array([1]), home, ['CLASE 14 30-10', 'Teoría']);
    expect(a).toBe(join(home, 'Downloads', 'uade-mcp', 'CLASE 14 30-10', 'Teoría', 't.pdf'));
    expect(statSync(join(home, 'Downloads', 'uade-mcp', 'CLASE 14 30-10')).mode & 0o777).toBe(0o700);
    expect(segmentoSeguro('../../.ssh')).toBe('_.._.ssh');
    expect(segmentoSeguro('a/b\\c')).toBe('a_b_c');
    for (const malo of ['..', '.', '', '   ', '\u0000']) expect(() => segmentoSeguro(malo), malo).toThrow('carpeta');
  });
});

describe('bajar una carpeta entera', () => {
  const f = (nombre: string, ruta: string, kb = 10): EntradaSP => ({ nombre, tipo: 'archivo', ruta, tamanoKB: kb });
  const d = (nombre: string, ruta: string): EntradaSP => ({ nombre, tipo: 'carpeta', ruta });
  const arbol: Record<string, EntradaSP[]> = {
    '/r/CLASE 14': [d('src', '/r/CLASE 14/src'), f('teoria.pptx', '/r/CLASE 14/teoria.pptx'), f('guia.pdf', '/r/CLASE 14/guia.pdf'), f('sqlite.rar', '/r/CLASE 14/sqlite.rar'), f('video.mp4', '/r/CLASE 14/video.mp4', 900_000)],
    '/r/CLASE 14/src': [f('Main.java', '/r/CLASE 14/src/Main.java'), f('notas.pdf', '/r/CLASE 14/src/notas.pdf')],
  };
  const listar = async (ruta: string) => arbol[ruta] ?? [];

  it('sin recursivo: solo los documentos del nivel pedido; lo que no es documento o pesa de más se informa', async () => {
    const r = await recorrerCarpeta(listar, '/r/CLASE 14', { recursivo: false });
    expect(r.guardar.map((a) => a.nombre)).toEqual(['teoria.pptx', 'guia.pdf']);
    expect(r.guardar.every((a) => a.subcarpetas.length === 0)).toBe(true);
    expect(r.salteados).toEqual(['sqlite.rar (no es un documento)', 'video.mp4 (no es un documento)']);
  });

  it('types filtra en silencio (fue pedido) y recursivo entra a las subcarpetas conservando la ruta relativa', async () => {
    const r = await recorrerCarpeta(listar, '/r/CLASE 14', { tipos: ['PDF'], recursivo: true });
    expect(r.guardar.map((a) => [a.nombre, a.subcarpetas])).toEqual([['guia.pdf', []], ['notas.pdf', ['src']]]);
    expect(r.salteados).toEqual([]);
  });

  it('un zip demasiado grande se saltea con el peso, y hay un tope de archivos por llamada', async () => {
    const muchos = Array.from({ length: MAX_ARCHIVOS_CARPETA + 2 }, (_, i) => f(`a${i}.pdf`, `/r/X/a${i}.pdf`));
    const r = await recorrerCarpeta(async () => [f('grande.zip', '/r/X/grande.zip', 30 * 1024), ...muchos], '/r/X', { recursivo: false });
    expect(r.guardar).toHaveLength(MAX_ARCHIVOS_CARPETA);
    expect(r.salteados[0]).toBe('grande.zip (30720 KB, demasiado grande)');
    expect(r.salteados.slice(1)).toEqual([`a${MAX_ARCHIVOS_CARPETA}.pdf (tope de ${MAX_ARCHIVOS_CARPETA} archivos por llamada)`, `a${MAX_ARCHIVOS_CARPETA + 1}.pdf (tope de ${MAX_ARCHIVOS_CARPETA} archivos por llamada)`]);
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

  it('un zip bomb disfrazado de docx o de xlsx se corta a los 60 MB reales, sin abrirlo', async () => {
    const grande = new Uint8Array(70 * 1024 * 1024); // 70 MB de ceros: comprimen a casi nada
    const docx = zipSync({ 'word/document.xml': grande });
    expect(docx.length).toBeLessThan(200_000);
    await expect(leerDocumento('apunte.docx', docx)).rejects.toThrow('sospechosamente grande');
    const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': grande });
    await expect(leerDocumento('planilla.xlsx', xlsx)).rejects.toThrow('sospechosamente grande');
  });
});
