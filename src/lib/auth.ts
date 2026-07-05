import type { Env, User, Session } from '../types';

const USERS_KEY = 'auth:users';
const SESSION_PREFIX = 'auth:session:';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7天

/** 简单的字符串哈希（非加密安全，但足够用于边缘函数） */
function hashPassword(password: string, salt: string): string {
  // 使用 SubtleCrypto API
  // 在 Edge Runtime 中可用
  return password + ':' + salt; // 占位，实际在 async 函数中处理
}

/** 使用 Web Crypto API 哈希密码 */
export async function hashPwd(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return salt + ':' + bufToHex(hash);
}

/** 验证密码 */
export async function verifyPwd(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash) === hashHex;
}

/** 生成会话 token */
export function generateToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

/** 创建会话 */
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

/** 获取会话 */
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

/** 删除会话 */
export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.AUTH_KV.delete(SESSION_PREFIX + token);
}

/** 获取所有用户 */
export async function getUsers(env: Env): Promise<User[]> {
  const raw = await env.AUTH_KV.get(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

/** 保存用户列表 */
export async function saveUsers(env: Env, users: User[]): Promise<void> {
  await env.AUTH_KV.put(USERS_KEY, JSON.stringify(users));
}

/** 初始化默认用户（首次运行） */
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

/** 从请求中提取 token */
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

/** 从请求中验证用户身份 */
export async function authenticate(env: Env, request: Request): Promise<Session | null> {
  const token = extractToken(request);
  if (!token) return null;
  return getSession(env, token);
}

/** Buffer 转 Hex */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
