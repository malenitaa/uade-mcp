import { describe, expect, it } from 'vitest';
import { fragmentos, textoPagina } from '../src/sources/webcampus/secciones.js';
import { PageChangedError } from '../src/sources/webcampus/parse.js';

describe('secciones de WebCampus', () => {
  it('toma solo el contenido principal, sin menú ni scripts', () => {
    const html = '<div id="menu">Cuenta Corriente Becas</div><div id="ctl00_ContentPlaceHolderMain_pnl"><h3>Becas</h3><p>Requisitos de la beca</p><script>x()</script><div id="ctl00_ContentPlaceHolderMain_sub">Plazo hasta marzo</div></div>';
    expect(textoPagina(html)).toBe('Becas Requisitos de la beca Plazo hasta marzo');
    expect(() => textoPagina('<div>otra cosa</div>')).toThrow(PageChangedError);
  });

  it('devuelve fragmentos alrededor de la consulta, sin tildes', () => {
    const texto = 'x'.repeat(1000) + ' La inasistencia justificada requiere certificado médico. ' + 'y'.repeat(1000);
    const f = fragmentos(texto, 'inasistencia médico', 60);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('inasistencia justificada requiere certificado médico');
    expect(fragmentos(texto, 'aranceles')).toEqual([]);
  });
});
