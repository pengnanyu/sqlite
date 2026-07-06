/**
 * Copyright (c) 2024 深圳市德诚四方科技有限公司. All rights reserved.
 */
import type { Env } from './types';
import { handleProtocolApi } from './handlers/admin';
import { handleAdminApi } from './handlers/admin';
import { initDefaultUsers } from './lib/auth';
import { handleAdminPage } from './handlers/admin-page';

// Extend globalThis for edge runtime
declare global {
  // eslint-disable-next-line no-var
  var __usersInitialized: boolean | undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 鍒濆鍖栭粯璁ょ敤鎴凤紙浠呭湪棣栨鍐峰惎鍔ㄦ椂鎵ц锛?
    if (!globalThis.__usersInitialized) {
      await initDefaultUsers(env);
      globalThis.__usersInitialized = true;
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // 鍏叡 API锛氬崗璁暟鎹煡璇?
    if (path === '/api/data' || path === '/api/data/') {
      return handleProtocolApi(request, env);
    }

    // 鍏叡 API锛氱増鏈垪琛?
    if (path === '/api/versions' || path === '/api/versions/') {
      return handleProtocolApi(request, env);
    }

    // 绠＄悊 API
    if (path.startsWith('/api/admin/')) {
      return handleAdminApi(request, env);
    }

    // 绠＄悊 Web 鐣岄潰
    if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
      return handleAdminPage(request, env);
    }

    // 鍋ュ悍妫€鏌?
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
