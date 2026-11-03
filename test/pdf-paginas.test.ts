// Páginas de un PDF ilegible dibujadas como PNG (pdf.js + @napi-rs/canvas), cortadas en tiras.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paginasComoImagenes } from '../src/sources/docs/pdf-paginas.js';

const fx = (p: string) => new Uint8Array(readFileSync(new URL(`./fixtures/calendario/${p}`, import.meta.url)));
const medidas = (png: Uint8Array) => { const b = Buffer.from(png); return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) }; };

describe('paginasComoImagenes', () => {
  it('una página apaisada sale como un PNG de 1200 px de ancho', async () => {
    const r = await paginasComoImagenes(fx('cronos_inscrip_previos.pdf'));
    expect(r).toHaveLength(1);
    expect(r[0]!.mimeType).toBe('image/png');
    expect(medidas(r[0]!.bytes)).toEqual({ ancho: r[0]!.ancho, alto: r[0]!.alto });
    expect(r[0]!.ancho).toBe(1200);
    expect(r[0]!.bytes.length).toBeGreaterThan(10_000);
  });

  it('una página larga se corta en tiras solapadas que cubren todo el alto', async () => {
    const r = await paginasComoImagenes(fx('crono_mriverano.pdf'));
    expect(r.length).toBeGreaterThan(2);
    for (const t of r) expect(t.alto).toBeLessThanOrEqual(1560);
    const total = r.reduce((n, t) => n + t.alto, 0) - 40 * (r.length - 1);
    expect(total).toBeGreaterThan(4000); // 583 × 2279 pt a 1200 px de ancho ≈ 4690 px de alto
  });
});
