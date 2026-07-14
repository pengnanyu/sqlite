interface Env {
  DB_KV: KVNamespace;
}

const DB_PREFIX = 'db:';
const DB_INDEX_KEY = 'db:index';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function getDbIndex(env: Env): Promise<string[]> {
  const raw = await env.DB_KV.get(DB_INDEX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function updateDbIndex(env: Env, names: string[]): Promise<void> {
  await env.DB_KV.put(DB_INDEX_KEY, JSON.stringify(names));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // GET /api/databases
      if (method === 'GET' && path === '/api/databases') {
        const names = await getDbIndex(env);
        const databases = [];
        for (const name of names) {
          const meta = await env.DB_KV.get(DB_PREFIX + name + ':meta');
          databases.push(meta ? JSON.parse(meta) : { name, tables: [], updatedAt: 0 });
        }
        return json({ databases });
      }

      // POST /api/databases
      if (method === 'POST' && path === '/api/databases') {
        const body: any = await request.json();
        const name = body.name;
        if (!name) return json({ error: '名称必填' }, 400);
        const names = await getDbIndex(env);
        if (!names.includes(name)) {
          names.push(name);
          await updateDbIndex(env, names);
        }
        const meta = { name, tables: [], updatedAt: Date.now() };
        await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
        return json({ message: '已创建', name });
      }

      // DELETE /api/databases/:name
      if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const names = await getDbIndex(env);
        const idx = names.indexOf(name);
        if (idx >= 0) { names.splice(idx, 1); await updateDbIndex(env, names); }
        await env.DB_KV.delete(DB_PREFIX + name + ':meta');
        await env.DB_KV.delete(DB_PREFIX + name + ':data');
        return json({ message: '已删除', name });
      }

      // GET /api/databases/:name/export
      if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/export$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const data = await env.DB_KV.get(DB_PREFIX + name + ':data', 'arrayBuffer');
        if (!data || (data as ArrayBuffer).byteLength === 0) {
          return json({ error: '数据库为空或不存在' }, 404);
        }
        return new Response(data, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${name}.db"`,
            ...corsHeaders(),
          },
        });
      }

      // POST /api/databases/:name/import - 导入db二进制到KV
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/import$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const body: any = await request.json();
        const base64Data = body.data;
        if (!base64Data) return json({ error: '缺少数据' }, 400);

        const bytes = base64ToUint8Array(base64Data);
        await env.DB_KV.put(DB_PREFIX + name + ':data', bytes.buffer as ArrayBuffer);

        const names = await getDbIndex(env);
        if (!names.includes(name)) { names.push(name); await updateDbIndex(env, names); }

        const meta = { name, tables: body.tables || [], updatedAt: Date.now() };
        await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
        return json({ message: '已导入', name, size: bytes.length });
      }

      // GET /api/databases/:name/tables
      if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/tables$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const metaRaw = await env.DB_KV.get(DB_PREFIX + name + ':meta');
        if (!metaRaw) return json({ tables: [] });
        const meta = JSON.parse(metaRaw);
        return json({ database: name, tables: meta.tables || [] });
      }

      // POST /api/databases/:name/save - 保存整个数据库（前端sql.js导出后上传）
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/save$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const body: any = await request.json();
        const base64Data = body.data;
        if (!base64Data) return json({ error: '缺少数据' }, 400);

        const bytes = base64ToUint8Array(base64Data);
        await env.DB_KV.put(DB_PREFIX + name + ':data', bytes.buffer as ArrayBuffer);

        const tables = body.tables || [];
        const meta = { name, tables, updatedAt: Date.now() };
        await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));

        const names = await getDbIndex(env);
        if (!names.includes(name)) { names.push(name); await updateDbIndex(env, names); }

        return json({ message: '已保存', name, size: bytes.length });
      }

      return json({ error: '未找到路由', path }, 404);
    } catch (e: any) {
      return json({ error: e.message, stack: e.stack?.substring(0, 200) }, 500);
    }
  },
};
