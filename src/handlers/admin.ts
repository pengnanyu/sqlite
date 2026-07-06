/**
 * Copyright (c) 2024 深圳市德诚四方科技有限公司. All rights reserved.
 */
import type { Env, ApiResponse } from '../types';
import { searchProtocol, listProtocols, getProtocol, putProtocol, deleteProtocol, batchImport, exportAllProtocols } from '../lib/kv';
import { parseCSV, csvRowsToJson, jsonToCSV } from '../lib/csv';
import { authenticate } from '../lib/auth';
import { jsonResponse } from '../index';
import { syncToGitHub, syncFromGitHub } from '../lib/github';
import { hashPwd, verifyPwd, getUsers, saveUsers, createSession, deleteSession, getSession, extractToken } from '../lib/auth';
import type { User, ProtocolEntry } from '../types';

/** 澶勭悊鍏叡鍗忚 API锛堝吋瀹规棫鎺ュ彛锛?*/
export async function handleProtocolApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const search = url.searchParams.get('search');

  if (search) {
    const entry = await searchProtocol(env, search);
    if (!entry) {
      return jsonResponse({ error: 'Not found', message: `鐗堟湰 ${search} 鏈壘鍒癭 }, 404);
    }
    // 鍏煎鏃?API 鏍煎紡
    return jsonResponse({
      table: entry.table,
      columns: entry.columns,
      rows: entry.rows,
    });
  }

  // 杩斿洖鐗堟湰鍒楄〃
  const versions = await listProtocols(env);
  return jsonResponse({ versions });
}

/** 澶勭悊绠＄悊 API */
export async function handleAdminApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/admin', '');
  const method = request.method;

  // 鐧诲綍涓嶉渶瑕佽璇?
  if (path === '/login' && method === 'POST') {
    return handleLogin(request, env);
  }

  // 鎵€鏈夊叾浠栫鐞?API 闇€瑕佽璇?
  const session = await authenticate(env, request);
  if (!session) {
    return jsonResponse({ success: false, error: '鏈櫥褰曟垨浼氳瘽宸茶繃鏈? }, 401);
  }

  // 璺敱
  if (path === '/session' && method === 'GET') {
    return jsonResponse({ success: true, data: session });
  }

  if (path === '/logout' && method === 'POST') {
    const token = extractToken(request);
    await deleteSession(env, token);
    return jsonResponse({ success: true });
  }

  if (path === '/protocols' && method === 'GET') {
    const versions = await listProtocols(env);
    return jsonResponse({ success: true, data: versions });
  }

  if (path === '/protocols/export' && method === 'GET') {
    const entries = await exportAllProtocols(env);
    const format = url.searchParams.get('format') || 'json';
    if (format === 'csv') {
      // 瀵煎嚭涓?CSV锛堝悎骞舵墍鏈夌増鏈級
      const allRows: Record<string, unknown>[] = [];
      for (const entry of entries) {
        for (const row of entry.rows) {
          allRows.push({ _version: entry.version, _table: entry.table, ...row });
        }
      }
      const columns = allRows.length > 0 ? Object.keys(allRows[0]) : [];
      const csv = jsonToCSV(columns, allRows);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="protocols.csv"',
        },
      });
    }
    return jsonResponse({ success: true, data: entries });
  }

  if (path === '/protocols/import' && method === 'POST') {
    if (session.role === 'viewer') {
      return jsonResponse({ success: false, error: '鏃犳潈闄? }, 403);
    }
    return handleImport(request, env);
  }

  if (path === '/protocols/sync-github' && method === 'POST') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '浠呯鐞嗗憳鍙悓姝? }, 403);
    }
    const direction = url.searchParams.get('direction') || 'push';
    if (direction === 'pull') {
      const result = await syncFromGitHub(env);
      return jsonResponse({ success: result.success, message: result.message, data: { count: result.count } });
    }
    const result = await syncToGitHub(env);
    return jsonResponse({ success: result.success, message: result.message, data: { fileCount: result.fileCount } });
  }

  // 鍗忚 CRUD
  const protocolMatch = path.match(/^\/protocols\/([^/]+)$/);
  if (protocolMatch) {
    const version = decodeURIComponent(protocolMatch[1]);

    if (method === 'GET') {
      const entry = await getProtocol(env, version);
      if (!entry) return jsonResponse({ success: false, error: '鏈壘鍒? }, 404);
      return jsonResponse({ success: true, data: entry });
    }

    if (session.role === 'viewer') {
      return jsonResponse({ success: false, error: '鏃犳潈闄? }, 403);
    }

    if (method === 'PUT') {
      const body = await request.json() as Partial<ProtocolEntry>;
      const existing = await getProtocol(env, version);
      const entry: ProtocolEntry = {
        version: body.version || version,
        table: body.table ?? existing?.table ?? '',
        columns: body.columns ?? existing?.columns ?? [],
        rows: body.rows ?? existing?.rows ?? [],
        updatedAt: Date.now(),
      };
      await putProtocol(env, entry);
      return jsonResponse({ success: true, data: entry });
    }

    if (method === 'DELETE') {
      if (session.role !== 'admin') {
        return jsonResponse({ success: false, error: '浠呯鐞嗗憳鍙垹闄? }, 403);
      }
      await deleteProtocol(env, version);
      return jsonResponse({ success: true });
    }

    if (method === 'POST') {
      // 鍒涘缓鏂板崗璁?
      const body = await request.json() as Partial<ProtocolEntry>;
      const existing = await getProtocol(env, version);
      if (existing) {
        return jsonResponse({ success: false, error: '鐗堟湰宸插瓨鍦? }, 409);
      }
      const entry: ProtocolEntry = {
        version,
        table: body.table || '',
        columns: body.columns || [],
        rows: body.rows || [],
        updatedAt: Date.now(),
      };
      await putProtocol(env, entry);
      return jsonResponse({ success: true, data: entry }, 201);
    }
  }

  // 鐢ㄦ埛绠＄悊锛堜粎绠＄悊鍛橈級
  if (path === '/users' && method === 'GET') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '浠呯鐞嗗憳鍙煡鐪嬬敤鎴? }, 403);
    }
    const users = await getUsers(env);
    const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
    return jsonResponse({ success: true, data: safeUsers });
  }

  if (path === '/users' && method === 'POST') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '浠呯鐞嗗憳鍙垱寤虹敤鎴? }, 403);
    }
    return handleCreateUser(request, env);
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === 'DELETE') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '浠呯鐞嗗憳鍙垹闄ょ敤鎴? }, 403);
    }
    const userId = userMatch[1];
    const users = await getUsers(env);
    const filtered = users.filter(u => u.id !== userId);
    await saveUsers(env, filtered);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: '鏈煡 API' }, 404);
}

/** 鐧诲綍澶勭悊 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { username: string; password: string };
  if (!body.username || !body.password) {
    return jsonResponse({ success: false, error: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' }, 400);
  }

  const users = await getUsers(env);
  const user = users.find(u => u.username === body.username);
  if (!user) {
    return jsonResponse({ success: false, error: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' }, 401);
  }

  const valid = await verifyPwd(body.password, user.passwordHash);
  if (!valid) {
    return jsonResponse({ success: false, error: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' }, 401);
  }

  const session = await createSession(env, user);
  const response: ApiResponse = {
    success: true,
    data: {
      token: session.token,
      username: session.username,
      role: session.role,
      expiresAt: session.expiresAt,
    },
  };

  const resp = jsonResponse(response);
  resp.headers.append('Set-Cookie', `bms_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  return resp;
}

/** 瀵煎叆澶勭悊 */
async function handleImport(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const version = formData.get('version') as string || '';
    const tableName = formData.get('table') as string || '';
    const format = (formData.get('format') as string) || 'json';

    if (!file) {
      return jsonResponse({ success: false, error: '鏈壘鍒版枃浠? }, 400);
    }

    const text = await file.text();
    return processImport(text, format, version, tableName, env);
  }

  // JSON body 瀵煎叆
  const body = await request.json() as { format: string; data: string; version: string; table: string };
  return processImport(body.data, body.format || 'json', body.version, body.table, env);
}

/** 澶勭悊瀵煎叆鏁版嵁 */
async function processImport(
  text: string,
  format: string,
  version: string,
  tableName: string,
  env: Env
): Promise<Response> {
  try {
    let entries: ProtocolEntry[] = [];

    if (format === 'json') {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        // 鎵归噺瀵煎叆
        entries = data.map((item: Record<string, unknown>) => ({
          version: String(item.version || version || ''),
          table: String(item.table || tableName || ''),
          columns: item.columns as string[] || [],
          rows: item.rows as Record<string, unknown>[] || [],
          updatedAt: Date.now(),
        }));
      } else if (data.columns && data.rows) {
        // 鍗曚釜鍗忚
        entries = [{
          version: version || String(data.version || ''),
          table: data.table || tableName || '',
          columns: data.columns as string[],
          rows: data.rows as Record<string, unknown>[],
          updatedAt: Date.now(),
        }];
      }
    } else if (format === 'csv') {
      const rows = parseCSV(text);
      const { columns, rows: jsonRows } = csvRowsToJson(rows, true);
      if (!version) {
        return jsonResponse({ success: false, error: 'CSV 瀵煎叆闇€瑕佹寚瀹氱増鏈彿' }, 400);
      }
      entries = [{
        version,
        table: tableName || version,
        columns,
        rows: jsonRows,
        updatedAt: Date.now(),
      }];
    } else {
      return jsonResponse({ success: false, error: `涓嶆敮鎸佺殑鏍煎紡: ${format}` }, 400);
    }

    const validEntries = entries.filter(e => e.version && e.columns.length > 0);
    if (validEntries.length === 0) {
      return jsonResponse({ success: false, error: '娌℃湁鏈夋晥鐨勬暟鎹? }, 400);
    }

    const count = await batchImport(env, validEntries);
    return jsonResponse({ success: true, message: `鎴愬姛瀵煎叆 ${count} 涓崗璁増鏈琡, data: { count } });
  } catch (e) {
    return jsonResponse({ success: false, error: `瀵煎叆澶辫触: ${(e as Error).message}` }, 500);
  }
}

/** 鍒涘缓鐢ㄦ埛 */
async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { username: string; password: string; role: User['role'] };
  if (!body.username || !body.password) {
    return jsonResponse({ success: false, error: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' }, 400);
  }
  if (!['admin', 'editor', 'viewer'].includes(body.role)) {
    return jsonResponse({ success: false, error: '鏃犳晥鐨勮鑹? }, 400);
  }

  const users = await getUsers(env);
  if (users.some(u => u.username === body.username)) {
    return jsonResponse({ success: false, error: '鐢ㄦ埛鍚嶅凡瀛樺湪' }, 409);
  }

  const newUser: User = {
    id: crypto.randomUUID(),
    username: body.username,
    passwordHash: await hashPwd(body.password),
    role: body.role,
    createdAt: Date.now(),
  };

  users.push(newUser);
  await saveUsers(env, users);

  return jsonResponse({
    success: true,
    data: { id: newUser.id, username: newUser.username, role: newUser.role, createdAt: newUser.createdAt },
  }, 201);
}
