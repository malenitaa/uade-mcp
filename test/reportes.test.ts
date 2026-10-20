// Reporte de errores: solo con el permiso prendido, sin datos personales, una vez por día, y nunca rompe.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SessionExpiredError } from '../src/net/session.js';
import { assertAllowed, PolicyError } from '../src/net/policy.js';
import { armarReporte, reportarError, tapar } from '../src/report/errores.js';
import { PageChangedError } from '../src/sources/webcampus/parse.js';

const dir = () => mkdtempSync(join(tmpdir(), 'rep-'));
const con = new Set(['reportes.errores'] as const);
const sin = new Set(['webcampus.leer'] as const);

describe('qué se manda', () => {
  it('cambio de página: tool, tipo y página; sin mensaje ni contenido', () => {
    const r = armarReporte(new PageChangedError('historial académico', '<html>Legajo 1000001 alguien@ejemplo.edu</html>'), 'webcampus_transcript');
    expect(r).toMatchObject({ tool: 'webcampus_transcript', tipo: 'PageChangedError', pagina: 'historial académico', detalle: '' });
    expect(JSON.stringify(r)).not.toMatch(/1000001|ejemplo\.edu|Legajo/);
  });
  it('otros errores: el mensaje con mails, números largos y rutas tapados', () => {
    expect(tapar('No encontré la clase 99999 de alguien@ejemplo.edu en /Users/alguien/x')).toBe('No encontré la clase <n> de <mail> en <home>/x');
  });
});

describe('cuándo se manda', () => {
  it('sin permiso, nunca; con permiso, una vez por día por error', async () => {
    const enviar = vi.fn(async () => undefined);
    const d = dir();
    expect(await reportarError(new PageChangedError('x'), sin, { enviar, dir: d, tool: 't' })).toBeNull();
    expect(await reportarError(new PageChangedError('x'), con, { enviar, dir: d, tool: 't' })).toMatchObject({ pagina: 'x' });
    expect(await reportarError(new PageChangedError('x'), con, { enviar, dir: d, tool: 't' })).toBeNull();
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('errores esperables (sesión vencida, política) no se reportan; si el envío falla, no rompe', async () => {
    const d = dir();
    expect(await reportarError(new SessionExpiredError('WebCampus'), con, { enviar: vi.fn(), dir: d, tool: 't' })).toBeNull();
    expect(await reportarError(new PolicyError('x'), con, { enviar: vi.fn(), dir: d, tool: 't' })).toBeNull();
    await expect(reportarError(new Error('boom'), con, { enviar: async () => { throw new Error('red'); }, dir: d, tool: 't' })).resolves.toMatchObject({ tipo: 'Error' });
  });
  it('a planuade.ar solo puede ir el reporte, nada más', () => {
    expect(() => assertAllowed('https://planuade.ar/api/mcp-error')).not.toThrow();
    expect(() => assertAllowed('https://planuade.ar/api/sync')).toThrow(PolicyError);
    expect(() => assertAllowed('https://planuade.ar/')).toThrow(PolicyError);
  });
});
