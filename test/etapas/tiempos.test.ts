// Tiempos: cada tool, en frío y por el protocolo MCP contra las fixtures, tiene que responder dentro
// de su presupuesto (test/etapas/presupuestos.ts). Responde: ¿este cambio volvió lenta alguna tool?
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRESUPUESTOS, SIN_MEDIR } from './presupuestos.js';
import { levantar, type Simulada } from './uade-simulada.js';

vi.mock('@napi-rs/keyring', async () => (await import('./uade-simulada.js')).llaveroSimulado);

let s: Simulada;
beforeAll(async () => {
  s = await levantar();
  await s.llamar('webcampus_terms'); // la primera llamada paga la carga de módulos: no se le cobra a nadie
});
afterAll(() => s.cerrar());

describe('tiempos', () => {
  it('toda tool tiene presupuesto o un motivo para no medirla', async () => {
    const { tools } = await s.client.listTools();
    const sinDecidir = tools.map((t) => t.name).filter((n) => !(n in PRESUPUESTOS) && !(n in SIN_MEDIR));
    expect(sinDecidir).toEqual([]);
    const deMas = [...Object.keys(PRESUPUESTOS), ...Object.keys(SIN_MEDIR)].filter((n) => !tools.some((t) => t.name === n));
    expect(deMas).toEqual([]);
  });

  const medidos: string[] = [];
  for (const [tool, { args, ms }] of Object.entries(PRESUPUESTOS)) {
    it(`${tool} responde en menos de ${ms} ms`, async () => {
      await s.llamar('uade_refresh', { topic: 'todo' }); // en frío: sin copia local
      const t0 = performance.now();
      const r = await s.llamar(tool, args);
      const tardo = performance.now() - t0;
      medidos.push(`${tool.padEnd(32)} ${tardo.toFixed(1).padStart(7)} ms  (presupuesto ${ms})`);
      expect(r.isError, r.texto.slice(0, 200)).toBe(false); // un error rápido no cuenta como rápido
      expect(tardo, `${tool} tardó ${tardo.toFixed(0)} ms; su presupuesto es ${ms} ms (test/etapas/presupuestos.ts)`).toBeLessThan(ms);
    });
  }

  // Con TIEMPOS_VER=1 imprime lo medido, para recalibrar los presupuestos con números y no a ojo.
  afterAll(() => { if (process.env.TIEMPOS_VER === '1') console.log(medidos.join('\n')); });
});
