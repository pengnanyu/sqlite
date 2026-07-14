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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // GET /api/databases - 列出所有数据库
      if (method === 'GET' && path === '/api/databases') {
        const names = await getDbIndex(env);
        const databases = [];
        for (const name of names) {
          const meta = await env.DB_KV.get(DB_PREFIX + name + ':meta');
          databases.push(meta ? JSON.parse(meta) : { name, tables: [], updatedAt: 0 });
        }
        return json({ databases });
      }

      // POST /api/databases - 创建数据库
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
        await env.DB_KV.put(DB_PREFIX + name + ':data', '');
        return json({ message: '已创建', name });
      }

      // DELETE /api/databases/:name - 删除数据库
      if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const names = await getDbIndex(env);
        const idx = names.indexOf(name);
        if (idx >= 0) { names.splice(idx, 1); await updateDbIndex(env, names); }
        await env.DB_KV.delete(DB_PREFIX + name + ':meta');
        await env.DB_KV.delete(DB_PREFIX + name + ':data');
        const list = await env.DB_KV.list({ prefix: DB_PREFIX + name + ':table:' });
        for (const key of list.keys) { await env.DB_KV.delete(key.name); }
        return json({ message: '已删除', name });
      }

      // GET /api/databases/:name/export - 导出db文件
      if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/export$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const data = await env.DB_KV.get(DB_PREFIX + name + ':data', 'arrayBuffer');
        if (!data) return json({ error: '数据库不存在' }, 404);
        return new Response(data, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${name}.db"`,
            ...corsHeaders(),
          },
        });
      }

      // POST /api/databases/:name/import - 导入db文件
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/import$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const body: any = await request.json();
        const base64Data = body.data;
        const merge = body.merge;
        if (!base64Data) return json({ error: '缺少数据' }, 400);

        const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        await env.DB_KV.put(DB_PREFIX + name + ':data', binary);

        const names = await getDbIndex(env);
        if (!names.includes(name)) { names.push(name); await updateDbIndex(env, names); }

        const meta = { name, tables: body.tables || [], updatedAt: Date.now(), merge };
        await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
        return json({ message: merge ? '增量合并完成' : '已导入', name });
      }

      // GET /api/databases/:name/tables - 列出表
      if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/tables$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const metaRaw = await env.DB_KV.get(DB_PREFIX + name + ':meta');
        if (!metaRaw) return json({ tables: [] });
        const meta = JSON.parse(metaRaw);
        const tables = meta.tables || [];
        const result = [];
        for (const t of tables) {
          const tableData = await env.DB_KV.get(DB_PREFIX + name + ':table:' + t);
          result.push({ name: t, rowCount: tableData ? JSON.parse(tableData).rows.length : 0 });
        }
        return json({ database: name, tables: result });
      }

      // GET /api/databases/:name/tables/:table - 查询表数据
      if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const table = decodeURIComponent(path.split('/')[5]);
        const data = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
        if (!data) return json({ columns: [], rows: [], total: 0 });
        const parsed = JSON.parse(data);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '200');
        const offset = (page - 1) * limit;
        const rows = parsed.rows.slice(offset, offset + limit);
        return json({ columns: parsed.columns, rows, total: parsed.rows.length, page, limit });
      }

      // POST /api/databases/:name/tables/:table - 创建表或插入行
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const table = decodeURIComponent(path.split('/')[5]);
        const body: any = await request.json();

        if (body.create) {
          const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
          if (existing) return json({ error: '表已存在' }, 400);
          const columns = body.columns || ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
          const tableData = { columns: typeof columns === 'string' ? columns.split(',').map((c: string) => c.trim()) : columns, rows: [] };
          await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
          const metaRaw = await env.DB_KV.get(DB_PREFIX + name + ':meta');
          const meta = metaRaw ? JSON.parse(metaRaw) : { name, tables: [] };
          if (!meta.tables.includes(table)) meta.tables.push(table);
          meta.updatedAt = Date.now();
          await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
          return json({ message: '表已创建', table });
        }

        if (body.row) {
          const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
          if (!existing) return json({ error: '表不存在' }, 404);
          const tableData = JSON.parse(existing);
          tableData.rows.push(body.row);
          await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
          return json({ message: '行已插入' });
        }

        if (body.rows) {
          const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
          const tableData = existing ? JSON.parse(existing) : { columns: body.columns || [], rows: [] };
          tableData.rows.push(...body.rows);
          await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
          return json({ message: `${body.rows.length} 行已插入` });
        }

        return json({ error: '缺少操作' }, 400);
      }

      // PUT /api/databases/:name/tables/:table - 更新行
      if (method === 'PUT' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const table = decodeURIComponent(path.split('/')[5]);
        const body: any = await request.json();
        const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
        if (!existing) return json({ error: '表不存在' }, 404);
        const tableData = JSON.parse(existing);
        const { rowIndex, row } = body;
        if (rowIndex >= 0 && rowIndex < tableData.rows.length) {
          tableData.rows[rowIndex] = { ...tableData.rows[rowIndex], ...row };
          await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
          return json({ message: '行已更新' });
        }
        return json({ error: '行索引无效' }, 400);
      }

      // DELETE /api/databases/:name/tables/:table - 删除行或删表
      if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const table = decodeURIComponent(path.split('/')[5]);
        const body: any = await request.json();

        if (body.drop) {
          await env.DB_KV.delete(DB_PREFIX + name + ':table:' + table);
          const metaRaw = await env.DB_KV.get(DB_PREFIX + name + ':meta');
          const meta = metaRaw ? JSON.parse(metaRaw) : { name, tables: [] };
          meta.tables = meta.tables.filter((t: string) => t !== table);
          meta.updatedAt = Date.now();
          await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
          return json({ message: '表已删除', table });
        }

        const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
        if (!existing) return json({ error: '表不存在' }, 404);
        const tableData = JSON.parse(existing);
        if (body.rowIndices) {
          tableData.rows = tableData.rows.filter((_: any, i: number) => !body.rowIndices.includes(i));
        }
        await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
        return json({ message: '已删除' });
      }

      // POST /api/databases/:name/batch - 批量操作
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/batch$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const body: any = await request.json();
        const { operations } = body;
        if (!Array.isArray(operations)) return json({ error: 'operations必须是数组' }, 400);
        const results = [];
        for (const op of operations) {
          try {
            const key = DB_PREFIX + name + ':table:' + op.table;
            const existing = await env.DB_KV.get(key);
            const tableData = existing ? JSON.parse(existing) : { columns: op.columns || [], rows: [] };
            if (op.type === 'insert' && op.row) {
              tableData.rows.push(op.row);
            } else if (op.type === 'update' && op.rowIndex >= 0) {
              tableData.rows[op.rowIndex] = { ...tableData.rows[op.rowIndex], ...op.row };
            } else if (op.type === 'delete' && op.rowIndices) {
              tableData.rows = tableData.rows.filter((_: any, i: number) => !op.rowIndices.includes(i));
            }
            await env.DB_KV.put(key, JSON.stringify(tableData));
            results.push({ success: true, type: op.type });
          } catch (e: any) {
            results.push({ success: false, type: op.type, error: e.message });
          }
        }
        return json({ results });
      }

      // POST /api/databases/:name/tables/:table/csv - CSV导入
      if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+\/csv$/)) {
        const name = decodeURIComponent(path.split('/')[3]);
        const table = decodeURIComponent(path.split('/')[5]);
        const body: any = await request.json();
        const { columns, rows, replace } = body;
        let tableData;
        const existing = await env.DB_KV.get(DB_PREFIX + name + ':table:' + table);
        if (existing && !replace) {
          tableData = JSON.parse(existing);
          tableData.rows.push(...rows);
        } else {
          tableData = { columns, rows };
        }
        await env.DB_KV.put(DB_PREFIX + name + ':table:' + table, JSON.stringify(tableData));
        const metaRaw = await env.DB_KV.get(DB_PREFIX + name + ':meta');
        const meta = metaRaw ? JSON.parse(metaRaw) : { name, tables: [] };
        if (!meta.tables.includes(table)) meta.tables.push(table);
        meta.updatedAt = Date.now();
        await env.DB_KV.put(DB_PREFIX + name + ':meta', JSON.stringify(meta));
        return json({ message: 'CSV导入完成', rows: rows.length });
      }

      return json({ error: '未找到路由', path }, 404);
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  },
};