const initSqlJs = require('sql.js');
const { getKV } = require('./kv');

let SQL = null;
let dbInstances = new Map();

async function initializer() {
  SQL = await initSqlJs();
  console.log('sql.js initialized');
}

async function loadDb(dbName) {
  if (dbInstances.has(dbName)) return dbInstances.get(dbName);
  const kv = getKV();
  const key = `db:${dbName}`;
  const data = await kv.getBuffer(key);
  let db;
  if (data) {
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }
  dbInstances.set(dbName, db);
  return db;
}

async function saveDb(dbName) {
  const db = dbInstances.get(dbName);
  if (!db) return false;
  const kv = getKV();
  const data = db.export();
  const buffer = Buffer.from(data);
  await kv.put(`db:${dbName}`, buffer);
  return true;
}

function queryToJson(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  const columns = stmt.getColumnNames();
  while (stmt.step()) {
    const row = {};
    const values = stmt.get();
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    results.push(row);
  }
  stmt.free();
  return { columns, results };
}

function jsonResponse(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
    body: JSON.stringify(data),
  };
}

async function handleRequest(req) {
  if (req.method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } };
  }

  const url = new URL(req.path || req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;
  const body = req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : {};

  try {
    // GET /api/databases - 列出所有数据库
    if (method === 'GET' && path === '/api/databases') {
      const kv = getKV();
      const keys = await kv.list('db:');
      const databases = keys.map(k => k.replace('db:', ''));
      return jsonResponse({ databases });
    }

    // POST /api/databases - 创建数据库
    if (method === 'POST' && path === '/api/databases') {
      const { name } = body;
      if (!name) return jsonResponse({ error: '数据库名称必填' }, 400);
      const db = await loadDb(name);
      await saveDb(name);
      return jsonResponse({ message: '数据库已创建', name });
    }

    // DELETE /api/databases/:name - 删除数据库
    if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+$/)) {
      const name = path.split('/').pop();
      const kv = getKV();
      dbInstances.delete(name);
      await kv.delete(`db:${name}`);
      return jsonResponse({ message: '数据库已删除', name });
    }

    // POST /api/databases/:name/import - 导入db文件
    if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/import$/)) {
      const name = path.split('/')[3];
      const { data: base64Data, merge } = body;
      if (!base64Data) return jsonResponse({ error: '缺少数据' }, 400);
      const buffer = Buffer.from(base64Data, 'base64');

      if (merge) {
        const db = await loadDb(name);
        const srcDb = new SQL.Database(buffer);
        const tables = queryToJson(srcDb, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        for (const t of tables.results) {
          const tableName = t.name;
          const srcData = queryToJson(srcDb, `SELECT * FROM "${tableName}"`);
          if (srcData.columns.length === 0) continue;
          const colList = srcData.columns.map(c => `"${c}"`).join(',');
          const placeholders = srcData.columns.map(() => '?').join(',');
          const insertSql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
          const stmt = db.prepare(insertSql);
          for (const row of srcData.results) {
            const vals = srcData.columns.map(c => row[c]);
            stmt.run(vals);
          }
          stmt.free();
        }
        srcDb.close();
        await saveDb(name);
        return jsonResponse({ message: '增量合并完成', name });
      } else {
        const srcDb = new SQL.Database(buffer);
        dbInstances.set(name, srcDb);
        await saveDb(name);
        return jsonResponse({ message: '数据库已导入', name });
      }
    }

    // GET /api/databases/:name/tables - 列出所有表
    if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/tables$/)) {
      const name = path.split('/')[3];
      const db = await loadDb(name);
      const data = queryToJson(db, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      return jsonResponse({ database: name, tables: data.results });
    }

    // GET /api/databases/:name/tables/:table - 查询单表
    if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const db = await loadDb(name);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = (page - 1) * limit;
      const countResult = queryToJson(db, `SELECT COUNT(*) as total FROM "${table}"`);
      const total = countResult.results[0]?.total || 0;
      const data = queryToJson(db, `SELECT * FROM "${table}" LIMIT ? OFFSET ?`, [limit, offset]);
      return jsonResponse({ database: name, table, ...data, total, page, limit });
    }

    // POST /api/databases/:name/tables/:table - 插入行
    if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const { row } = body;
      if (!row) return jsonResponse({ error: '缺少行数据' }, 400);
      const db = await loadDb(name);
      const cols = Object.keys(row).map(c => `"${c}"`).join(',');
      const vals = Object.values(row);
      const placeholders = vals.map(() => '?').join(',');
      db.run(`INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`, vals);
      await saveDb(name);
      return jsonResponse({ message: '行已插入', database: name, table });
    }

    // PUT /api/databases/:name/tables/:table - 更新行
    if (method === 'PUT' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const { row, where } = body;
      if (!row || !where) return jsonResponse({ error: '缺少行数据或条件' }, 400);
      const db = await loadDb(name);
      const setClause = Object.keys(row).map(c => `"${c}" = ?`).join(', ');
      const whereClause = Object.keys(where).map(c => `"${c}" = ?`).join(' AND ');
      const vals = [...Object.values(row), ...Object.values(where)];
      db.run(`UPDATE "${table}" SET ${setClause} WHERE ${whereClause}`, vals);
      await saveDb(name);
      return jsonResponse({ message: '行已更新', database: name, table });
    }

    // DELETE /api/databases/:name/tables/:table - 删除行
    if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const where = body.where || body;
      const db = await loadDb(name);
      if (Object.keys(where).length > 0) {
        const whereClause = Object.keys(where).map(c => `"${c}" = ?`).join(' AND ');
        db.run(`DELETE FROM "${table}" WHERE ${whereClause}`, Object.values(where));
      } else {
        db.run(`DELETE FROM "${table}"`);
      }
      await saveDb(name);
      return jsonResponse({ message: '行已删除', database: name, table });
    }

    // POST /api/databases/:name/query - 执行SQL
    if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/query$/)) {
      const name = path.split('/')[3];
      const { sql, params } = body;
      if (!sql) return jsonResponse({ error: 'SQL必填' }, 400);
      const db = await loadDb(name);
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
        const data = queryToJson(db, sql, params || []);
        return jsonResponse({ database: name, ...data });
      } else {
        db.run(sql, params || []);
        await saveDb(name);
        return jsonResponse({ message: 'SQL已执行', database: name, changes: db.getRowsModified() });
      }
    }

    // POST /api/databases/:name/batch - 批量操作
    if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/batch$/)) {
      const name = path.split('/')[3];
      const { operations } = body;
      if (!Array.isArray(operations)) return jsonResponse({ error: 'operations必须是数组' }, 400);
      const db = await loadDb(name);
      const results = [];
      for (const op of operations) {
        try {
          if (op.type === 'insert') {
            const cols = Object.keys(op.row).map(c => `"${c}"`).join(',');
            const vals = Object.values(op.row);
            const placeholders = vals.map(() => '?').join(',');
            db.run(`INSERT INTO "${op.table}" (${cols}) VALUES (${placeholders})`, vals);
            results.push({ success: true, type: 'insert' });
          } else if (op.type === 'update') {
            const setClause = Object.keys(op.row).map(c => `"${c}" = ?`).join(', ');
            const whereClause = Object.keys(op.where).map(c => `"${c}" = ?`).join(' AND ');
            db.run(`UPDATE "${op.table}" SET ${setClause} WHERE ${whereClause}`, [...Object.values(op.row), ...Object.values(op.where)]);
            results.push({ success: true, type: 'update' });
          } else if (op.type === 'delete') {
            const whereClause = Object.keys(op.where).map(c => `"${c}" = ?`).join(' AND ');
            db.run(`DELETE FROM "${op.table}" WHERE ${whereClause}`, Object.values(op.where));
            results.push({ success: true, type: 'delete' });
          } else if (op.type === 'sql') {
            db.run(op.sql, op.params || []);
            results.push({ success: true, type: 'sql' });
          }
        } catch (e) {
          results.push({ success: false, type: op.type, error: e.message });
        }
      }
      await saveDb(name);
      return jsonResponse({ database: name, results });
    }

    // GET /api/databases/:name/export - 导出db文件
    if (method === 'GET' && path.match(/^\/api\/databases\/[^/]+\/export$/)) {
      const name = path.split('/')[3];
      const db = await loadDb(name);
      const data = db.export();
      const buffer = Buffer.from(data);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${name}.db"`,
          'Access-Control-Allow-Origin': '*',
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    }

    // POST /api/databases/:name/tables/:table/create - 建表
    if (method === 'POST' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+\/create$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const { columns: cols } = body;
      if (!cols) return jsonResponse({ error: '缺少列定义' }, 400);
      const db = await loadDb(name);
      db.run(`CREATE TABLE IF NOT EXISTS "${table}" (${cols})`);
      await saveDb(name);
      return jsonResponse({ message: '表已创建', database: name, table });
    }

    // DELETE /api/databases/:name/tables/:table/drop - 删表
    if (method === 'DELETE' && path.match(/^\/api\/databases\/[^/]+\/tables\/[^/]+\/drop$/)) {
      const name = path.split('/')[3];
      const table = decodeURIComponent(path.split('/')[5]);
      const db = await loadDb(name);
      db.run(`DROP TABLE IF EXISTS "${table}"`);
      await saveDb(name);
      return jsonResponse({ message: '表已删除', database: name, table });
    }

    return jsonResponse({ error: '未找到路由' }, 404);
  } catch (e) {
    console.error('API Error:', e);
    return jsonResponse({ error: e.message }, 500);
  }
}

module.exports = { initializer, handleRequest };