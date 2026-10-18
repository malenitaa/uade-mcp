import { describe, expect, it, vi } from 'vitest';
import { assertPlanUadeUrl, openInBrowser } from '../src/net/open-browser.js';
import { toArgentineDates } from '../src/tools/common.js';

describe('fechas en formato argentino', () => {
  it('convierte ISO a dd/mm/aaaa en cualquier nivel, sin tocar otros textos', () => {
    expect(
      toArgentineDates({ desde: '2026-08-03T12:00', hasta: '2026-12-03', n: 5, clases: [{ dia: '2026-07-21' }], horario: '18:30 - 22:00', codigo: '3.4.071' }),
    ).toEqual({ desde: '03/08/2026 12:00', hasta: '03/12/2026', n: 5, clases: [{ dia: '21/07/2026' }], horario: '18:30 - 22:00', codigo: '3.4.071' });
  });
});

describe('abrir el navegador', () => {
  it('solo abre https://planuade.ar', () => {
    expect(() => assertPlanUadeUrl('https://planuade.ar/fain#importar=x')).not.toThrow();
    for (const bad of ['http://planuade.ar/fain', 'https://planuade.ar.evil.com/', 'file:///etc/passwd', 'https://evil.com/?planuade.ar']) {
      expect(() => assertPlanUadeUrl(bad)).toThrow();
    }
  });

  it('usa execFile con el link como un solo argumento (sin shell)', async () => {
    const exec = vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null) => void) => cb(null));
    await openInBrowser('https://planuade.ar/fain#importar=a;rm -rf ~&b', exec as never);
    const [, args] = exec.mock.calls[0]!;
    expect(args.at(-1)).toBe('https://planuade.ar/fain#importar=a;rm%20-rf%20~&b');
    expect(args).toHaveLength(process.platform === 'win32' ? 2 : 1);
  });
});
