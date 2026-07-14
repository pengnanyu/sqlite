const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'dist');
const files = ['index.html', 'app.js', 'kv.js', 'style.css'];

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const src = path.join(__dirname, f);
  const dst = path.join(outDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
}

console.log('Build complete: dist/');