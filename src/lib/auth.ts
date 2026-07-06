/**
 * Copyright (c) 2024 深圳市德诚四方科技有限公司. All rights reserved.
 */
import type { Env, User, Session } from '../types';

const USERS_KEY = 'auth:users';
const SESSION_PREFIX = 'auth:session:';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7澶?

/** 绠€鍗曠殑瀛楃涓插搱甯岋紙闈炲姞瀵嗗畨鍏紝浣嗚冻澶熺敤浜庤竟缂樺嚱鏁帮級 */
function hashPassword(password: string, salt: string): string {
  // 浣跨敤 SubtleCrypto API
  // 鍦?Edge Runtime 涓彲鐢?
  return password + ':' + salt; // 鍗犱綅锛屽疄闄呭湪 async 鍑芥暟涓鐞?
}

/** 浣跨敤 Web Crypto API 鍝堝笇瀵嗙爜 */
export async function hashPwd(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return salt + ':' + bufToHex(hash);
}

/** 楠岃瘉瀵嗙爜 */
export async function verifyPwd(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash) === hashHex;
}

/** 鐢熸垚浼氳瘽 token */
export function generateToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

/** 鍒涘缓浼氳瘽 */
export async function createSession(env: Env, user: User): Promise<Session> {
  const session: Session = {
    token: generateToken(),
    userId: user.id,
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL,
  };
  await env.AUTH_KV.put(
    SESSION_PREFIX + session.token,
    JSON.stringify(session),
    { expirationTtl: Math.floor(SESSION_TTL / 1000) }
  );
  return session;
}

/** 鑾峰彇浼氳瘽 */
export async function getSession(env: Env, token: string): Promise<Session | null> {
  if (!token) return null;
  const raw = await env.AUTH_KV.get(SESSION_PREFIX + token);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt < Date.now()) {
      await env.AUTH_KV.delete(SESSION_PREFIX + token);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** 鍒犻櫎浼氳瘽 */
export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.AUTH_KV.delete(SESSION_PREFIX + token);
}

/** 鑾峰彇鎵€鏈夌敤鎴?*/
export async function getUsers(env: Env): Promise<User[]> {
  const raw = await env.AUTH_KV.get(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

/** 淇濆瓨鐢ㄦ埛鍒楄〃 */
export async function saveUsers(env: Env, users: User[]): Promise<void> {
  await env.AUTH_KV.put(USERS_KEY, JSON.stringify(users));
}

/** 鍒濆鍖栭粯璁ょ敤鎴凤紙棣栨杩愯锛?*/
export async function initDefaultUsers(env: Env): Promise<void> {
  const existing = await getUsers(env);
  if (existing.length > 0) return;
  const defaultUser: User = {
    id: crypto.randomUUID(),
    username: 'admin',
    passwordHash: await hashPwd('admin123'),
    role: 'admin',
    createdAt: Date.now(),
  };
  await saveUsers(env, [defaultUser]);
}

/** 浠庤姹備腑鎻愬彇 token */
export function extractToken(request: Request): string {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/bms_token=([^;]+)/);
  if (match) return match[1];
  return '';
}

/** 浠庤姹備腑楠岃瘉鐢ㄦ埛韬唤 */
export async function authenticate(env: Env, request: Request): Promise<Session | null> {
  const token = extractToken(request);
  if (!token) return null;
  return getSession(env, token);
}

/** Buffer 杞?Hex */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
