// Clases de consulta: carrera, materias con clases y la grilla con los encabezados que tenga.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseClasesDeConsulta } from '../src/sources/webcampus/consultas.js';
import { WebCampus } from '../src/sources/webcampus/index.js';
import type { WebCampusClient } from '../src/sources/webcampus/client.js';

const fx = readFileSync(new URL('./fixtures/webcampus/consultas.html', import.meta.url), 'utf8');

describe('clases de consulta', () => {
  it('carreras, materias y filas de la grilla por encabezado', () => {
    const r = parseClasesDeConsulta(fx);
    expect(r.carreras).toEqual([{ id: '999', nombre: 'CARRERA FICTICIA' }]);
    expect(r.materias).toEqual([{ id: '9.9.001', nombre: '9.9.001 - MATERIA FICTICIA UNO' }, { id: '9.9.004', nombre: '9.9.004 - MATERIA FICTICIA CUATRO' }]);
    expect(r.clases).toEqual([
      { Materia: '9.9.004 - MATERIA FICTICIA CUATRO', 'Día': 'Lunes', Horario: '18:00 - 19:30', Sede: 'SEDE FICTICIA', Aula: 'A-101' },
      { Materia: '9.9.004 - MATERIA FICTICIA CUATRO', 'Día': 'Jueves', Horario: '18:00 - 19:30', Sede: 'SEDE FICTICIA' },
    ]);
    expect(r.form.__VIEWSTATE).toBe('vs-ficticio');
  });

  it('"Sin Resultados" no es una clase', () => {
    const sin = fx.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody><tr class="rgNoRecords"><td colspan="5">Sin Resultados</td></tr></tbody>');
    expect(parseClasesDeConsulta(sin).clases).toEqual([]);
  });

  it('dos postbacks: carrera y después la materia elegida por código o nombre', async () => {
    const get = vi.fn(async () => ({ html: fx }));
    const postback = vi.fn(async () => ({ html: fx }));
    const wc = new WebCampus({ get, postback } as unknown as WebCampusClient);
    const r = await wc.clasesDeConsulta('ficticia cuatro');
    expect(postback).toHaveBeenCalledTimes(2);
    expect(postback.mock.calls[0]![2]).toBe('ctl00$ContentPlaceHolderMain$ddlCarrera');
    expect(postback.mock.calls[1]![1]).toMatchObject({ 'ctl00$ContentPlaceHolderMain$ddlMateria': '9.9.004', __VIEWSTATE: 'vs-ficticio' });
    expect(r).toMatchObject({ carrera: 'CARRERA FICTICIA', materia: '9.9.004 - MATERIA FICTICIA CUATRO' });
    expect(r.clases).toHaveLength(2);
    expect((await wc.clasesDeConsulta('9.9.999')).aviso).toContain('no está entre las materias');
    expect((await wc.clasesDeConsulta()).aviso).toContain('Pasá subject');
  });
});
