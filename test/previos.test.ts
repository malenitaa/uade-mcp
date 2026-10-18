import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { coincide, parseAdjuntoPrevios, parseLinksNovedades, parsePreviosXlsx } from '../src/sources/webcampus/previos.js';

// Excel sintético con la misma forma que el de UADE: fila de título, encabezados, datos.
async function excelFicticio(): Promise<Uint8Array> {
  const t = (value: string) => ({ value });
  const data = [
    [t('EXÁMENES PREVIOS NOVIEMBRE-DICIEMBRE 2030 (programación sujeta a modificación)')],
    ['SEDE', 'CÓDIGO', 'MATERIA', 'FECHA', 'HORA', 'AULA', 'CLASE', 'DOCENTES'].map(t),
    [t('SEDE FICTICIA'), t('9.9.101'), t('MATERIA OFERTA UNO'), { value: new Date(Date.UTC(2030, 10, 30)), type: Date, format: 'dd/mm/yyyy' }, t('12:30 -'), t('A/C'), t('20001'), t('Docente, Ficticia; Ayudante, Otro')],
    [t('SEDE FICTICIA'), t('V9.9.102'), t('MATERIA OFERTA DOS'), t('03/12/2030'), t('18:30 - 21:30'), t('A/C'), t('20002'), t('A Confirmar')],
    [t('SEDE FICTICIA'), t('9.9.200'), t('OTRA MATERIA'), t('05/12/2030'), t('08:00'), t('A/C'), t('20003'), t('')],
  ];
  const buf: Buffer = await (writeXlsxFile(data as never) as unknown as { toBuffer(): Promise<Buffer> }).toBuffer();
  return new Uint8Array(buf);
}

describe('exámenes previos', () => {
  it('lee el Excel: fecha, hora, docentes y "A Confirmar"', async () => {
    const ex = await parsePreviosXlsx(await excelFicticio());
    expect(ex).toEqual([
      { sede: 'SEDE FICTICIA', codigo: '9.9.101', materia: 'MATERIA OFERTA UNO', fecha: '2030-11-30', hora: '12:30', aula: 'A/C', clase: '20001', docentes: ['Docente, Ficticia', 'Ayudante, Otro'] },
      { sede: 'SEDE FICTICIA', codigo: 'V9.9.102', materia: 'MATERIA OFERTA DOS', fecha: '2030-12-03', hora: '18:30 - 21:30', aula: 'A/C', clase: '20002', docentes: [] },
      { sede: 'SEDE FICTICIA', codigo: '9.9.200', materia: 'OTRA MATERIA', fecha: '2030-12-05', hora: '08:00', aula: 'A/C', clase: '20003', docentes: [] },
    ]);
  });

  it('filtra por código (con o sin prefijo V) o por nombre sin tildes', async () => {
    const ex = await parsePreviosXlsx(await excelFicticio());
    expect(ex.filter((e) => coincide(e, '9.9.102')).map((e) => e.clase)).toEqual(['20002']);
    expect(ex.filter((e) => coincide(e, 'oferta')).length).toBe(2);
  });

  it('encuentra la novedad y su adjunto, y rechaza rutas raras', () => {
    expect(parseLinksNovedades(readFileSync(new URL('./fixtures/webcampus/cursada.html', import.meta.url), 'utf8'))).toEqual([]);
    expect(parseLinksNovedades('<a href="MiContenido\\Novedades.aspx?Id=123&EsDC=False">x</a><a href="Novedades.aspx?Id=123">y</a>')).toEqual(['123']);
    expect(parseAdjuntoPrevios('<h3>Exámenes Previos (noviembre)</h3><a href="/DocsDownload/Novedades/1_1_previos.xlsx">Previos</a>')).toBe('/DocsDownload/Novedades/1_1_previos.xlsx');
    expect(parseAdjuntoPrevios('<h3>Feriados</h3><a href="/DocsDownload/Novedades/2_1_otro.pdf">x</a>')).toBeNull();
    expect(parseAdjuntoPrevios('<a href="/DocsDownload/../Login.aspx?previos.xlsx">Previos</a>')).toBeNull();
  });
});
