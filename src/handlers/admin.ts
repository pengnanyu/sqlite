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

/** 处理公共协议 API（兼容旧接口） */
export async function handleProtocolApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const search = url.searchParams.get('search');

  if (search) {
    const entry = await searchProtocol(env, search);
    if (!entry) {
      return jsonResponse({ error: 'Not found', message: `版本 ${search} 未找到` }, 404);
    }
    // 兼容旧 API 格式
    return jsonResponse({
      table: entry.table,
      columns: entry.columns,
      rows: entry.rows,
    });
  }

  // 返回版本列表
  const versions = await listProtocols(env);
  return jsonResponse({ versions });
}

/** 处理管理 API */
export async function handleAdminApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/admin', '');
  const method = request.method;

  // 登录不需要认证
  if (path === '/login' && method === 'POST') {
    return handleLogin(request, env);
  }

  // 所有其他管理 API 需要认证
  const session = await authenticate(env, request);
  if (!session) {
    return jsonResponse({ success: false, error: '未登录或会话已过期' }, 401);
  }

  // 路由
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
      // 导出为 CSV（合并所有版本）
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
      return jsonResponse({ success: false, error: '无权限' }, 403);
    }
    return handleImport(request, env);
  }

  if (path === '/protocols/sync-github' && method === 'POST') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '仅管理员可同步' }, 403);
    }
    const direction = url.searchParams.get('direction') || 'push';
    if (direction === 'pull') {
      const result = await syncFromGitHub(env);
      return jsonResponse({ success: result.success, message: result.message, data: { count: result.count } });
    }
    const result = await syncToGitHub(env);
    return jsonResponse({ success: result.success, message: result.message, data: { fileCount: result.fileCount } });
  }

  // 协议 CRUD
  const protocolMatch = path.match(/^\/protocols\/([^/]+)$/);
  if (protocolMatch) {
    const version = decodeURIComponent(protocolMatch[1]);

    if (method === 'GET') {
      const entry = await getProtocol(env, version);
      if (!entry) return jsonResponse({ success: false, error: '未找到' }, 404);
      return jsonResponse({ success: true, data: entry });
    }

    if (session.role === 'viewer') {
      return jsonResponse({ success: false, error: '无权限' }, 403);
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
        return jsonResponse({ success: false, error: '仅管理员可删除' }, 403);
      }
      await deleteProtocol(env, version);
      return jsonResponse({ success: true });
    }

    if (method === 'POST') {
      // 创建新协议
      const body = await request.json() as Partial<ProtocolEntry>;
      const existing = await getProtocol(env, version);
      if (existing) {
        return jsonResponse({ success: false, error: '版本已存在' }, 409);
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

  // 用户管理（仅管理员）
  if (path === '/users' && method === 'GET') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '仅管理员可查看用户' }, 403);
    }
    const users = await getUsers(env);
    const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
    return jsonResponse({ success: true, data: safeUsers });
  }

  if (path === '/users' && method === 'POST') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '仅管理员可创建用户' }, 403);
    }
    return handleCreateUser(request, env);
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === 'DELETE') {
    if (session.role !== 'admin') {
      return jsonResponse({ success: false, error: '仅管理员可删除用户' }, 403);
    }
    const userId = userMatch[1];
    const users = await getUsers(env);
    const filtered = users.filter(u => u.id !== userId);
    await saveUsers(env, filtered);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: '未知 API' }, 404);
}

/** 登录处理 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { username: string; password: string };
  if (!body.username || !body.password) {
    return jsonResponse({ success: false, error: '用户名和密码不能为空' }, 400);
  }

  const users = await getUsers(env);
  const user = users.find(u => u.username === body.username);
  if (!user) {
    return jsonResponse({ success: false, error: '用户名或密码错误' }, 401);
  }

  const valid = await verifyPwd(body.password, user.passwordHash);
  if (!valid) {
    return jsonResponse({ success: false, error: '用户名或密码错误' }, 401);
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

/** 导入处理 */
async function handleImport(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const version = formData.get('version') as string || '';
    const tableName = formData.get('table') as string || '';
    const format = (formData.get('format') as string) || 'json';

    if (!file) {
      return jsonResponse({ success: false, error: '未找到文件' }, 400);
    }

    const text = await file.text();
    return processImport(text, format, version, tableName, env);
  }

  // JSON body 导入
  const body = await request.json() as { format: string; data: string; version: string; table: string };
  return processImport(body.data, body.format || 'json', body.version, body.table, env);
}

/** 处理导入数据 */
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
        // 批量导入
        entries = data.map((item: Record<string, unknown>) => ({
          version: String(item.version || version || ''),
          table: String(item.table || tableName || ''),
          columns: item.columns as string[] || [],
          rows: item.rows as Record<string, unknown>[] || [],
          updatedAt: Date.now(),
        }));
      } else if (data.columns && data.rows) {
        // 单个协议
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
        return jsonResponse({ success: false, error: 'CSV 导入需要指定版本号' }, 400);
      }
      entries = [{
        version,
        table: tableName || version,
        columns,
        rows: jsonRows,
        updatedAt: Date.now(),
      }];
    } else {
      return jsonResponse({ success: false, error: `不支持的格式: ${format}` }, 400);
    }

    const validEntries = entries.filter(e => e.version && e.columns.length > 0);
    if (validEntries.length === 0) {
      return jsonResponse({ success: false, error: '没有有效的数据' }, 400);
    }

    const count = await batchImport(env, validEntries);
    return jsonResponse({ success: true, message: `成功导入 ${count} 个协议版本`, data: { count } });
  } catch (e) {
    return jsonResponse({ success: false, error: `导入失败: ${(e as Error).message}` }, 500);
  }
}

/** 创建用户 */
async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { username: string; password: string; role: User['role'] };
  if (!body.username || !body.password) {
    return jsonResponse({ success: false, error: '用户名和密码不能为空' }, 400);
  }
  if (!['admin', 'editor', 'viewer'].includes(body.role)) {
    return jsonResponse({ success: false, error: '无效的角色' }, 400);
  }

  const users = await getUsers(env);
  if (users.some(u => u.username === body.username)) {
    return jsonResponse({ success: false, error: '用户名已存在' }, 409);
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
