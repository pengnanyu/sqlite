/**
 * Build script for ESA Edge Function
 * Uses esbuild to bundle the worker, then copies to both _worker.js and index.js
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const outfile = 'dist/_worker.js';

// Ensure dist directory exists
const dir = dirname(outfile);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.html': 'text' },
  allowOverwrite: true,
});

// Also copy to index.js for ESA compatibility
copyFileSync(outfile, 'dist/index.js');

console.log('Build complete: dist/_worker.js, dist/index.js');
