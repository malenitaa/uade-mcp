// Legibilidad del texto de un PDF: los cronogramas de inscripción (Illustrator, fuentes sin mapa de
// caracteres) salen como códigos de control; los de detalle (listas de materias) salen bien.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerPdf } from '../src/sources/calendario/index.js';
import { textoLegible } from '../src/sources/docs/legible.js';

const fx = (p: string) => new Uint8Array(readFileSync(new URL(`./fixtures/calendario/${p}`, import.meta.url)));

describe('textoLegible', () => {
  it('texto de tablas con fechas, barras y guiones es legible; vacío o códigos de control no', () => {
    expect(textoLegible('Clase Desde Hasta Horario 1566 4/1/2027 9/1/2027 07:00 - 17:30 2.1.085 LENGUAJE, LÓGICA')).toBe(true);
    expect(textoLegible('')).toBe(false);
    expect(textoLegible('   ')).toBe(false);
    expect(textoLegible('\u001f\u001e\u001d\u001c \u001b\u001a\u0019 \u0018\u001a\u0017\u0018\u001d\u0016')).toBe(false);
    expect(textoLegible('--- /// ... ::: a')).toBe(false);
  });

  it('el PDF real de exámenes previos no da texto legible con pdf.js', async () => {
    const { texto } = await leerPdf(fx('cronos_inscrip_previos.pdf'));
    expect(textoLegible(texto)).toBe(false);
  });
});
