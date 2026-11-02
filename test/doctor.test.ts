// Cada tool registrada tiene que estar probada por `uade-mcp doctor` o figurar, con motivo, en
// TOOLS_SIN_PRUEBA. Así una tool nueva sin prueba no pasa los tests, y doctor sigue siendo la
// forma de enterarse cuando UADE cambia una página antes de que lo reporte alguien.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS_SIN_PRUEBA } from '../src/cli/doctor.js';

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const registradas = [...new Set(readdirSync(new URL('../src/tools', import.meta.url))
  .flatMap((f) => [...leer(`src/tools/${f}`).matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!)))].sort();
const probadas = [...new Set([...leer('src/cli/doctor.ts').matchAll(/await push\([^,]+,\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)))].sort();

describe('cobertura de doctor', () => {
  it('hay tools registradas y pruebas que las nombran', () => {
    expect(registradas.length).toBeGreaterThan(25);
    expect(probadas.length).toBeGreaterThan(20);
  });
  it('toda tool registrada tiene una prueba en doctor o un motivo para no tenerla', () => {
    const sinPrueba = registradas.filter((t) => !probadas.includes(t) && !(t in TOOLS_SIN_PRUEBA));
    expect(sinPrueba).toEqual([]);
  });
  it('las pruebas y la lista de excepciones no nombran tools que no existen ni se pisan', () => {
    expect(probadas.filter((t) => !registradas.includes(t))).toEqual([]);
    expect(Object.keys(TOOLS_SIN_PRUEBA).filter((t) => !registradas.includes(t))).toEqual([]);
    expect(Object.keys(TOOLS_SIN_PRUEBA).filter((t) => probadas.includes(t))).toEqual([]);
  });
});
