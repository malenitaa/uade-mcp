import { defineConfig } from 'vitest/config';

// Los tests son los de test/. experimentos/ es aparte (ver experimentos/README.md).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['experimentos/**', 'node_modules/**', 'dist/**'] },
});
