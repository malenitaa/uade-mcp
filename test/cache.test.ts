import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Cache, type KeyStore } from '../src/cache/cache.js';

const memKeys = (): KeyStore & { k: Buffer | null } => {
  const s = { k: null as Buffer | null, get: () => s.k, set: (k: Buffer) => { s.k = k; }, delete: () => { s.k = null; } };
  return s;
};

describe('caché local cifrada', () => {
  it('guarda cifrado: el archivo no contiene los datos en claro', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'c-')), 'cache.enc');
    const c = new Cache(file, memKeys(), true);
    await c.get('historial', 1000, async () => ({ nota: 8, materia: 'MATERIA SECRETA' }));
    expect(readFileSync(file).toString('latin1')).not.toContain('MATERIA SECRETA');
  });

  it('devuelve lo guardado hasta que vence, y después vuelve a pedir', async () => {
    let t = 0; let pedidos = 0;
    const c = new Cache(join(mkdtempSync(join(tmpdir(), 'c-')), 'cache.enc'), memKeys(), true, () => t);
    const fn = async () => ++pedidos;
    expect((await c.get('x', 100, fn)).value).toBe(1);
    t = 50; expect((await c.get('x', 100, fn)).value).toBe(1);
    t = 150; expect((await c.get('x', 100, fn)).value).toBe(2);
  });

  it('con otra clave no se puede leer (y arranca vacía)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'c-')), 'cache.enc');
    await new Cache(file, memKeys(), true).get('x', 10_000, async () => 'dato');
    let pedidos = 0;
    await new Cache(file, memKeys(), true).get('x', 10_000, async () => { pedidos++; return 'nuevo'; });
    expect(pedidos).toBe(1);
  });

  it('refrescar por tema y destruir (logout)', async () => {
    const keys = memKeys();
    const file = join(mkdtempSync(join(tmpdir(), 'c-')), 'cache.enc');
    const c = new Cache(file, keys, true);
    await c.get('cursada:', 10_000, async () => 1);
    await c.get('cuenta', 10_000, async () => 2);
    expect(c.clear('cuenta')).toBe(1);
    c.destroy();
    expect(keys.k).toBeNull();
    expect(() => readFileSync(file)).toThrow();
  });

  it('se puede desactivar (UADE_MCP_CACHE=0)', async () => {
    let pedidos = 0;
    const c = new Cache(join(mkdtempSync(join(tmpdir(), 'c-')), 'cache.enc'), memKeys(), false);
    await c.get('x', 10_000, async () => ++pedidos);
    await c.get('x', 10_000, async () => ++pedidos);
    expect(pedidos).toBe(2);
  });
});
