import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

const outfile = 'dist/_worker.js';
const dir = dirname(outfile);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
  allowOverwrite: true,
});

const publicDir = 'public';
if (existsSync(publicDir)) {
  const files = readdirSync(publicDir);
  for (const f of files) {
    copyFileSync(join(publicDir, f), join(dir, f));
  }
}

console.log('Build complete: dist/_worker.js + static assets');