import type { Env } from './types';
import { handleProtocolApi } from './handlers/protocol';
import { handleAdminApi } from './handlers/admin';
import { initDefaultUsers } from './lib/auth';
import { handleAdminPage } from './handlers/admin-page';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 初始化默认用户
    await initDefaultUsers(env);

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // 公共 API：协议数据查询
    if (path === '/api/data' || path === '/api/data/') {
      return handleProtocolApi(request, env);
    }

    // 公共 API：版本列表
    if (path === '/api/versions' || path === '/api/versions/') {
      return handleProtocolApi(request, env);
    }

    // 管理 API
    if (path.startsWith('/api/admin/')) {
      return handleAdminApi(request, env);
    }

    // 管理 Web 界面
    if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
      return handleAdminPage(request, env);
    }

    // 健康检查
    if (path === '/' || path === '/health') {
      return jsonResponse({
        service: 'bms-sqlite',
        status: 'ok',
        version: '1.0.0',
        time: new Date().toISOString(),
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
