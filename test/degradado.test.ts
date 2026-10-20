// Modo degradado: si UADE cambia una página, la tool devuelve el texto plano marcado, no inventa ni calla.
import { describe, expect, it } from 'vitest';
import { run } from '../src/tools/common.js';
import { PageChangedError, requireAnchor, textoPlano } from '../src/sources/webcampus/parse.js';
import * as cheerio from 'cheerio';

const html = '<html><head><style>.x{}</style><script>var a=1</script></head><body><h1>Historial</h1><table><tr><td>3.4.131</td><td>Gesti&oacute;n</td></tr></table><p>Promedio: 7,20</p></body></html>';

describe('texto plano', () => {
  it('saca scripts, estilos y etiquetas, y recorta', () => {
    const t = textoPlano(html);
    expect(t).not.toContain('var a=1');
    expect(t).not.toContain('<');
    expect(t).toContain('3.4.131');
    expect(t).toContain('Promedio: 7,20');
    expect(textoPlano('<p>' + 'x'.repeat(100) + '</p>', 20)).toMatch(/…\(recortado\)$/);
  });
  it('requireAnchor adjunta el texto de la página al error', () => {
    try {
      requireAnchor(cheerio.load(html), '#no-existe', 'historial académico');
      throw new Error('no tiró');
    } catch (e) {
      expect(e).toBeInstanceOf(PageChangedError);
      expect((e as PageChangedError).texto).toContain('Historial');
    }
  });
});

describe('run en modo degradado', () => {
  const granted = new Set(['webcampus.leer'] as const);
  it('con texto: responde sin error, marcado como degradado y con el texto', async () => {
    const r = await run(granted, 'webcampus.leer', async () => { throw new PageChangedError('historial académico', html); });
    expect(r.isError).toBeUndefined();
    const d = JSON.parse(r.content[0]!.text);
    expect(d.modoDegradado).toBe(true);
    expect(d.pagina).toBe('historial académico');
    expect(d.aviso).toContain('cambió la página');
    expect(d.textoSinEstructura).toContain('3.4.131');
  });
  it('sin texto (PDF o formato), sigue siendo un error normal', async () => {
    const r = await run(granted, 'webcampus.leer', async () => { throw new PageChangedError('tabla de aranceles'); });
    expect(r.isError).toBe(true);
  });
});
