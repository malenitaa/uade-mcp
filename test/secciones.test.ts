import { describe, expect, it } from 'vitest';
import { fragmentos, guiasEnlazadas, textoPagina } from '../src/sources/webcampus/secciones.js';
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

describe('guías enlazadas', () => {
  it('toma los PDF de /Docs/ de WebCampus y los públicos de dre.uade.edu.ar, solo del contenido (no del pie)', () => {
    const html = '<div id="ctl00_ContentPlaceHolderMain_p"><a href="https://www.webcampus.uade.edu.ar/Docs/Configuracion_WiFi_UADE_OSX.pdf">mac</a><a href="/Docs/Configuracion_WiFi_UADE_iOS.pdf">ios</a><a href="https://dre.uade.edu.ar/ayues.pdf">talleres</a><a href="https://evil.com/Docs/a.pdf">y</a><a href="mailto:x@uade.edu.ar">m</a></div><footer><a href="https://dre.uade.edu.ar/emergencia.pdf">pie</a></footer>';
    expect(guiasEnlazadas(html)).toEqual(['/Docs/Configuracion_WiFi_UADE_OSX.pdf', '/Docs/Configuracion_WiFi_UADE_iOS.pdf', 'https://dre.uade.edu.ar/ayues.pdf']);
  });
});
