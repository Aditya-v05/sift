import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'wxt/browser': fileURLToPath(new URL('./src/node-browser.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'] },
});
