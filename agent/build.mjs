// Bundles the agent package (src/) plus the extension's engine (../src/lib) into dist/cli.js.
// `wxt/browser` points at a Node stand-in (storage in ~/.sift, keys in memory), so src/lib runs unchanged.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('./src/cli.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/cli.js', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  alias: { 'wxt/browser': fileURLToPath(new URL('./src/node-browser.ts', import.meta.url)) },
  external: ['@modelcontextprotocol/sdk', 'happy-dom', 'zod'],
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('built dist/cli.js');
