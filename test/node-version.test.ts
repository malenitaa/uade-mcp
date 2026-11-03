// La versión mínima de Node se chequea al arrancar, antes de cargar pdf.js.
import { describe, expect, it } from 'vitest';
import { errorDeNode } from '../src/node-version.js';

describe('errorDeNode', () => {
  it('acepta 22 y más nuevas, rechaza 20 con un mensaje claro', () => {
    expect(errorDeNode('22.0.0')).toBeNull();
    expect(errorDeNode('24.18.0')).toBeNull();
    expect(errorDeNode('20.19.0')).toBe('uade-mcp necesita Node.js 22 o más nuevo; tenés 20.19.0. Bajalo de nodejs.org.');
    expect(errorDeNode('rara')).toContain('necesita Node.js 22');
  });
});
