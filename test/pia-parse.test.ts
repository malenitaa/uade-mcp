// Parsers y cliente de lectura de PIA, sobre fixtures sintéticas y un servidor simulado.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PageChangedError } from '../src/sources/webcampus/parse.js';
import { Pia, PiaClient } from '../src/sources/pia/index.js';
import { CONTROLES, esDelta, htmlDe, leerFormulario, parseBuscador, parseClases, parseDelta, parseFinalizar, parseMaterias } from '../src/sources/pia/parse.js';
import * as cheerio from 'cheerio';

const fx = (p: string) => readFileSync(new URL(`./fixtures/pia/${p}`, import.meta.url), 'utf8');

describe('formulario y buscador', () => {
  it('lee el estado completo del formulario (hidden, texto, select, radio marcado; sin botones)', () => {
    const f = leerFormulario(cheerio.load(fx('buscar.html')));
    expect(f.__VIEWSTATE).toBe('VS_FICTICIO');
    expect(f['ctl00$ContentPlaceHolder1$cboTurno']).toBe('-1');
    expect(f['ctl00$ContentPlaceHolder1$optOfrecimiento']).toBe('145');
    expect(f['ctl00$ContentPlaceHolder1$chkLunes']).toBeUndefined();
    expect(f[CONTROLES.buscar]).toBeUndefined();
  });

  it('ciclo, período, carrera y turnos disponibles', () => {
    const b = parseBuscador(fx('buscar.html'));
    expect(b).toMatchObject({ cicloLectivo: '2031', periodo: 'VERANO', carrera: 'LIC. FICTICIA (PLAN 99999)' });
    expect(b.turnos).toEqual([{ id: '10155', nombre: 'INTENSIVO' }, { id: '10156', nombre: 'NOCHE' }]);
    expect(() => parseBuscador('<html><form></form></html>')).toThrow(PageChangedError);
  });
});

describe('materias y clases', () => {
  it('materias por año con su estado y el checkbox para elegirlas', () => {
    const m = parseMaterias(fx('materias.html'));
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ anio: 'PRIMER AÑO', codigo: '9.9.101', info: 'Sin Clases en el Período', chk: null });
    expect(m[1]).toMatchObject({ anio: 'SEGUNDO AÑO', codigo: '9.9.102', materia: 'MATERIA FICTICIA DOS', regimen: 'EXAMEN FINAL OBLIGATORIO', info: null });
    expect(m[1]!.chk).toMatch(/chkSeleccionar$/);
  });

  it('clases con días (desde los hidden), horario, fechas ISO, vacantes, condiciones y botón de alta', () => {
    const c = parseClases(fx('clases.html'));
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({
      codigo: '9.9.102', materia: 'MATERIA FICTICIA DOS', clase: '1616', claseId: '111111', sede: 'SEDE PLAYA', modalidad: 'INTENSIVO', turno: 'INTENSIVO',
      dias: ['L', 'M', 'MI', 'J', 'V', 'S'], horario: '07:00 - 17:30', desde: '2031-01-18', hasta: '2031-01-23', vacantes: 18, regimenAprobacion: 'EXAMEN FINAL OBLIGATORIO', hospedaje: true,
    });
    expect(c[0]!.condiciones).toContain('retención de las cuotas');
    expect(c[0]!.btnAlta).toMatch(/ctl02\$btnCarritoAlta$/);
    expect(c[1]).toMatchObject({ clase: '2020', dias: ['M', 'J'], horario: '18:45 - 22:15', vacantes: 0, condiciones: null, hospedaje: false });
    expect(parseClases('<html><body>Sin Clases en el Período</body></html>')).toEqual([]);
    expect(() => parseClases('<html><body>otra cosa</body></html>')).toThrow(PageChangedError);
  });
});

describe('delta de MS AJAX', () => {
  const delta = '1|#||4|11|updatePanel|Panel1|<b>hola</b>|40|pageRedirect||%2fInscripcionFinalizar.aspx%3fparam%3dX|';
  it('separa paneles y redirecciones', () => {
    expect(esDelta(delta)).toBe(true);
    expect(esDelta('<html>')).toBe(false);
    const d = parseDelta(delta);
    expect(d.paneles.get('Panel1')).toBe('<b>hola</b>');
    expect(d.redirect).toBe('/InscripcionFinalizar.aspx?param=X');
    expect(htmlDe(delta)).toContain('<b>hola</b>');
    expect(htmlDe('<html>x</html>')).toBe('<html>x</html>');
  });
  it('un error del servidor no se disfraza de página', () => {
    expect(() => htmlDe('1|#||4|10|error|500|Falló algo|')).toThrow('PIA devolvió un error');
  });
});

describe('finalizar', () => {
  it('pendientes de alta, resumen arancelario con importes y vencimientos, términos y botón', () => {
    const f = parseFinalizar(fx('finalizar.html'));
    expect(f.pendientes).toEqual([{ codigo: '9.9.102', materia: 'MATERIA FICTICIA DOS', clase: '1616', sede: 'SEDE PLAYA', horario: '07:00 - 17:30', desde: '2031-01-18', hasta: '2031-01-23', btnBorrar: 'ctl00$ContentPlaceHolder1$ucCarrito$grdClasesAlta$grdResultados$ctl02$btnBorrar' }]);
    expect(f.aranceles).toEqual([
      { descripcion: 'ASIGNATURA INDIVIDUAL INTENSIVO - GRADO', vencimiento: '2030-10-27', importe: 185065, moneda: 'PESOS' },
      { descripcion: 'ASIGNATURA INDIVIDUAL INTENSIVO - GRADO', vencimiento: '2031-01-08', importe: 370131, moneda: 'PESOS' },
    ]);
    expect(f.terminos).toBe('https://inscripcionespia.uade.edu.ar/Terminos.aspx');
    expect(f.puedeFinalizar).toBe(true);
    expect(f.form[CONTROLES.terminos]).toBeUndefined();
  });
});

// Servidor simulado: responde según el control que dispara cada postback y registra lo que recibe.
function clienteSimulado() {
  const recibido: { path: string; body: URLSearchParams | null }[] = [];
  const client = new PiaClient();
  (client as unknown as { request: unknown }).request = async (path: string, init: { method: string; body?: URLSearchParams }) => {
    recibido.push({ path, body: init.body ?? null });
    const target = init.body?.get('__EVENTTARGET') ?? '';
    let html = fx('buscar.html');
    if (target === CONTROLES.seleccionarMaterias) html = fx('materias.html');
    else if (init.body?.get(CONTROLES.buscar)) html = fx('clases.html');
    return { html, url: new URL(path, 'https://inscripcionespia.uade.edu.ar'), bytes: new Uint8Array() };
  };
  return { pia: new Pia(client), recibido };
}

describe('Pia.buscar', () => {
  const link = 'https://inscripcionespia.uade.edu.ar/InscripcionClaseBuscar.aspx?param=FICTICIO';

  it('abre el link, elige las materias, el turno y los días, y devuelve las clases', async () => {
    const { pia, recibido } = clienteSimulado();
    const r = await pia.buscar(link, { materias: ['9.9.102', '9.9.101'], turno: 'intensivo', dias: ['L', 'MI'] });
    expect(r).toMatchObject({ cicloLectivo: '2031', periodo: 'VERANO', turnos: ['INTENSIVO', 'NOCHE'] });
    expect(r.materias.map((m) => m.codigo)).toEqual(['9.9.102', '9.9.101']);
    expect(r.clases.map((c) => c.clase)).toEqual(['1616', '2020']);
    const buscar = recibido.at(-1)!.body!;
    expect(buscar.get('ctl00$ContentPlaceHolder1$ucMateriaInscripcionBuscador$rptMaterias$ctl01$grdMaterias$ctl02$chkSeleccionar')).toBe('on');
    expect(buscar.get('ctl00$ContentPlaceHolder1$cboTurno')).toBe('10155');
    expect(buscar.get('ctl00$ContentPlaceHolder1$chkLunes')).toBe('on');
    expect(buscar.get('ctl00$ContentPlaceHolder1$chkMiercoles')).toBe('on');
    expect(buscar.get('ctl00$ContentPlaceHolder1$chkMartes')).toBeNull();
    expect(buscar.get(CONTROLES.buscar)).toBe('Buscar');
    expect(buscar.get('__VIEWSTATE')).toBe('VS_FICTICIO_2');
    expect(recibido.every((r) => r.path.startsWith('/InscripcionClaseBuscar.aspx?param=FICTICIO'))).toBe(true);
  });

  it('sin turno con varias opciones, pide uno; materia desconocida, lista las que hay; solo materias sin clases, no busca', async () => {
    const { pia, recibido } = clienteSimulado();
    await expect(pia.buscar(link, { materias: ['9.9.102'] })).rejects.toThrow('INTENSIVO, NOCHE');
    await expect(pia.buscar(link, { materias: ['1.1.111'], turno: 'NOCHE' })).rejects.toThrow('9.9.101, 9.9.102, 9.9.103');
    const r = await pia.buscar(link, { materias: ['9.9.101'], turno: 'NOCHE' });
    expect(r.clases).toEqual([]);
    expect(r.materias[0]!.info).toBe('Sin Clases en el Período');
    expect(recibido.some((x) => x.body?.get(CONTROLES.buscar))).toBe(false);
  });

  it('rechaza links que no sean de PIA y más de 6 materias', async () => {
    const { pia } = clienteSimulado();
    await expect(pia.buscar('https://evil.example/InscripcionClaseBuscar.aspx?param=x', { materias: ['9.9.102'] })).rejects.toThrow('no es de PIA');
    await expect(pia.buscar(link, { materias: ['1', '2', '3', '4', '5', '6', '7'] })).rejects.toThrow('entre 1 y 6');
  });
});
