/** 协议数据库条目 */
export interface ProtocolEntry {
  version: string;
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  updatedAt: number;
}

/** 协议版本元数据（列表用） */
export interface ProtocolMeta {
  version: string;
  table: string;
  rowCount: number;
  updatedAt: number;
}

/** 用户 */
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: number;
}

/** 会话 */
export interface Session {
  token: string;
  userId: string;
  username: string;
  role: User['role'];
  expiresAt: number;
}

/** ESA/Cloudflare Worker 环境 */
export interface Env {
  PROTOCOL_KV: KVNamespace;
  AUTH_KV: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  JWT_SECRET: string;
}

/** API 响应包装 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** CSV 导入选项 */
export interface ImportOptions {
  format: 'csv' | 'json' | 'sqlite';
  version?: string;
  table?: string;
  hasHeader?: boolean;
  delimiter?: string;
}
