import { defineConfig } from 'vitest/config';

// Los tests son los de test/. experimentos/ es aparte (ver experimentos/README.md).
// El aviso de versión nueva va apagado en los tests, así ninguno le pregunta nada al registro de npm
// por accidente; lo prenden los que lo prueban, siempre contra un registro simulado.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['experimentos/**', 'node_modules/**', 'dist/**'], env: { UADE_MCP_AVISO_VERSION: '0' } },
});
