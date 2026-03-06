import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: '/npxall/',
  build: { outDir: 'dist' },
  test: { testTimeout: 15000 },
});
