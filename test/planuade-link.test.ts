import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildImportLink } from '../src/sources/planuade/link.js';
import { parseHistorial } from '../src/sources/webcampus/parse.js';

const historial = parseHistorial(readFileSync(new URL('./fixtures/webcampus/historial.html', import.meta.url), 'utf8'));

function decode(url: string) {
  const frag = new URL(url).hash;
  expect(frag).toMatch(/^#importar=[A-Za-z0-9_-]+$/);
  return JSON.parse(Buffer.from(frag.slice('#importar='.length), 'base64url').toString('utf8'));
}

describe('link de importación de PlanUADE', () => {
  it('elige la facultad por el código de plan y arma el payload v1', () => {
    const link = buildImportLink({ ...historial, plan: '13121' });
    expect(link.url.startsWith('https://planuade.ar/fain#importar=')).toBe(true);
    expect(link.carrera).toBe('lgti');

    const p = decode(link.url);
    expect(p).toMatchObject({ v: 1, origen: 'uade-mcp', plan: '13121' });
    expect(p.materias).toEqual([
      { id: '9.9.001', st: 'approved', nota: 8, desde: '2028-12-15' },
      { id: '9.9.002', st: 'approved', nota: 10, desde: '2029-03-05' },
      { id: '9.9.003', st: 'approved', nombre: 'MATERIA POR EQUIVALENCIA' }, // equivalencia: sin nota, con nombre
      { id: '9.9.004', st: 'pending', desde: '2029-12-02' },
      { id: '9.9.005', st: 'cursando' },
    ]);
    expect(link.resumen).toEqual({ aprobadas: 3, conNota: 2, finalesPendientes: 1, cursando: 1, omitidas: 2 });
  });

  it('el hash es el que verifica PlanUADE: sha256 de {v, origen, plan, materias}', () => {
    const p = decode(buildImportLink({ ...historial, plan: '13121' }).url);
    const expected = createHash('sha256')
      .update(JSON.stringify({ v: p.v, origen: p.origen, plan: p.plan, materias: p.materias }))
      .digest('hex');
    expect(p.h).toBe(expected);
  });

  it('el historial va solo en el fragmento, nunca en path ni query', () => {
    const u = new URL(buildImportLink({ ...historial, plan: '13121' }).url);
    expect(u.pathname).toBe('/fain');
    expect(u.search).toBe('');
  });

  it('si no reconoce el plan, pide la facultad', () => {
    expect(() => buildImportLink({ ...historial, plan: '1' })).toThrow('facultad');
    expect(buildImportLink({ ...historial, plan: '1' }, 'face').url).toMatch(/^https:\/\/planuade\.ar\/face#/);
  });
});
