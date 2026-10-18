import { describe, expect, it, vi } from 'vitest';
import { assertOpenableUrl, assertPlanUadeUrl, openInBrowser } from '../src/net/open-browser.js';
import { buildDraftUrl } from '../src/sources/mail/draft.js';
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

describe('borradores de mail', () => {
  it('arma el link de Outlook web con destinatario, asunto y cuerpo codificados', () => {
    const url = new URL(buildDraftUrl({ to: ['Docente.Ficticia@uade.edu.ar'], subject: 'Consulta parcial', body: 'Hola profe,\nno voy a poder ir el 10/12 & aviso.' }));
    expect(url.origin + url.pathname).toBe('https://outlook.office.com/mail/deeplink/compose');
    expect(url.searchParams.get('to')).toBe('docente.ficticia@uade.edu.ar');
    expect(url.searchParams.get('subject')).toBe('Consulta parcial');
    expect(url.searchParams.get('body')).toBe('Hola profe,\nno voy a poder ir el 10/12 & aviso.');
    expect(url.href).not.toContain('+');
  });

  it('solo deja escribir a direcciones @uade.edu.ar', () => {
    expect(() => buildDraftUrl({ to: ['alguien@gmail.com'], subject: 'x', body: 'y' })).toThrow('@uade.edu.ar');
    expect(() => buildDraftUrl({ to: ['a@uade.edu.ar'], cc: ['b@evil.com'], subject: 'x', body: 'y' })).toThrow('@uade.edu.ar');
    expect(() => buildDraftUrl({ to: ['a@uade.edu.ar.evil.com'], subject: 'x', body: 'y' })).toThrow();
  });

  it('el navegador solo abre Plan UADE y Outlook web', () => {
    expect(() => assertOpenableUrl('https://outlook.office.com/mail/deeplink/compose?to=a')).not.toThrow();
    expect(() => assertOpenableUrl('https://outlook.live.com/mail/0/deeplink/compose')).toThrow();
    expect(() => assertPlanUadeUrl('https://outlook.office.com/mail')).toThrow();
  });
});
