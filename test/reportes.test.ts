// Reporte de errores: solo con el permiso prendido, sin datos personales, una vez por día, y nunca rompe.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ErrorDeUso } from '../src/error-de-uso.js';
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
  it('errores técnicos: el mensaje con mails, números largos, rutas y comillas tapados', () => {
    expect(tapar('No encontré la clase 99999 de alguien@ejemplo.edu en /Users/alguien/x')).toBe('No encontré la clase <n> de <mail> en <home>/x');
    expect(tapar('No pude descargar "Caso Arcor.pdf" ni “TP Final.docx”')).toBe('No pude descargar "…" ni "…"');
    expect(armarReporte(new TypeError('fetch failed'), 't')).toMatchObject({ tipo: 'TypeError', detalle: 'fetch failed' });
  });
  it('un ErrorDeUso (materias, archivos, carreras en el mensaje) manda solo el tipo, nunca el mensaje', () => {
    const casos = [
      'Según tu historial y las correlativas no podés rendir 3.4.131: falta aprobar Álgebra.',
      'No encontré "Caso Arcor" en CLASE 4. Archivos: TP1.pdf, Consigna final.docx',
      'La materia "Finanzas Corporativas" no tiene apuntes de Teams enlazados en WebCampus.',
      'No encontré "Licenciatura en Economía" en la tabla de aranceles (80 carreras).',
      'PIA devolvió un error: El alumno adeuda correlativas de Microeconomía II',
    ];
    for (const m of casos) {
      const r = armarReporte(new ErrorDeUso(m), 'una_tool');
      expect(r).toMatchObject({ tipo: 'ErrorDeUso', detalle: '', pagina: null });
      expect(JSON.stringify(r)).not.toMatch(/Arcor|Álgebra|Finanzas|Economía|Microeconomía|TP1|Consigna/);
    }
  });
  it('todo mensaje de error del código que interpola datos leídos de la cuenta es un ErrorDeUso', () => {
    // Un `throw new Error(\`…\${x}…\`)` nuevo con datos del estudiante haría que el mensaje viaje en el
    // reporte. Acá solo pueden quedar los que interpolan constantes, estados HTTP o cosas del CLI.
    const permitidos = new Set([
      'src/net/session.ts', // nombre del sitio y status HTTP
      'src/sources/calendario/index.ts', // cantidad de páginas y tope
      'src/sources/planificador/index.ts', // tope de materias
      'src/sources/docs/leer.ts', // extensión del archivo
      'src/sources/webcampus/previos.ts', // "El Excel" / "El Excel de exámenes previos"
      'src/cli/index.ts', 'src/cli/login.ts', // la terminal: no pasa por el reporte
    ]);
    const archivos = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]));
    const sospechosos = archivos('src')
      .filter((f) => f.endsWith('.ts') && !permitidos.has(f))
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/new Error\(`[^`]*\$\{[^`]*`/g)].map((m) => `${f}: ${m[0].slice(0, 80)}`));
    expect(sospechosos).toEqual([]);
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
  it('la clave de "ya se mandó hoy" es tool|tipo|página: dos mensajes distintos del mismo tipo cuentan una vez, y en disco no queda el mensaje', async () => {
    const enviar = vi.fn(async () => undefined);
    const d = dir();
    expect(await reportarError(new TypeError('fetch failed: legajo 1234567'), con, { enviar, dir: d, tool: 't' })).not.toBeNull();
    expect(await reportarError(new TypeError('otro mensaje'), con, { enviar, dir: d, tool: 't' })).toBeNull();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(d, 'reportes.json'), 'utf8')).not.toMatch(/fetch|1234567|otro/);
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
