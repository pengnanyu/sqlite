const http = require('http');
const fs = require('fs');
const path = require('path');
const { initializer, handleRequest } = require('./functions/api/index');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.db': 'application/octet-stream',
};

async function start() {
  try {
    await initializer();
  } catch (e) {
    console.error('初始化失败:', e.message);
    console.log('提示: 请先运行 npm install 安装 sql.js');
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname.startsWith('/api/')) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const fcReq = {
          method: req.method,
          path: url.pathname,
          url: req.url,
          headers: req.headers,
          body: body || undefined,
          queries: Object.fromEntries(url.searchParams),
        };
        try {
          const result = await handleRequest(fcReq);
          res.writeHead(result.statusCode || 200, result.headers || {});
          if (result.isBase64Encoded) {
            res.end(Buffer.from(result.body, 'base64'));
          } else {
            res.end(result.body);
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath);
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  SQLite Online 开发服务器已启动`);
    console.log(`  http://localhost:${PORT}\n`);
  });
}

start();