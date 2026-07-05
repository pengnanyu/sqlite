import type { ProtocolEntry, ProtocolMeta, Env } from '../types';

const VERSIONS_KEY = 'proto:versions';
const VERSION_PREFIX = 'proto:version:';

/** 获取所有协议版本元数据列表 */
export async function listProtocols(env: Env): Promise<ProtocolMeta[]> {
  const raw = await env.PROTOCOL_KV.get(VERSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProtocolMeta[];
  } catch {
    return [];
  }
}

/** 获取指定版本的完整协议数据 */
export async function getProtocol(env: Env, version: string): Promise<ProtocolEntry | null> {
  const raw = await env.PROTOCOL_KV.get(VERSION_PREFIX + version);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProtocolEntry;
  } catch {
    return null;
  }
}

/** 兼容旧 API：按 search 查询 */
export async function searchProtocol(env: Env, search: string): Promise<ProtocolEntry | null> {
  // 精确匹配
  const exact = await getProtocol(env, search);
  if (exact) return exact;

  // 模糊匹配
  const versions = await listProtocols(env);
  const match = versions.find(v =>
    v.version.toLowerCase().includes(search.toLowerCase())
  );
  if (match) {
    return getProtocol(env, match.version);
  }
  return null;
}

/** 保存/更新协议数据 */
export async function putProtocol(env: Env, entry: ProtocolEntry): Promise<void> {
  entry.updatedAt = Date.now();
  await env.PROTOCOL_KV.put(VERSION_PREFIX + entry.version, JSON.stringify(entry));
  await updateVersionsIndex(env);
}

/** 删除协议数据 */
export async function deleteProtocol(env: Env, version: string): Promise<void> {
  await env.PROTOCOL_KV.delete(VERSION_PREFIX + version);
  await updateVersionsIndex(env);
}

/** 更新版本索引 */
export async function updateVersionsIndex(env: Env): Promise<void> {
  // KV 没有列出所有 key 的好方法，所以我们维护一个索引
  // 先尝试 list API
  const list = await env.PROTOCOL_KV.list({ prefix: VERSION_PREFIX });
  const metas: ProtocolMeta[] = [];

  for (const key of list.keys) {
    const raw = await env.PROTOCOL_KV.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as ProtocolEntry;
      metas.push({
        version: entry.version,
        table: entry.table,
        rowCount: entry.rows.length,
        updatedAt: entry.updatedAt,
      });
    } catch {
      // skip invalid
    }
  }

  metas.sort((a, b) => a.version.localeCompare(b.version));
  await env.PROTOCOL_KV.put(VERSIONS_KEY, JSON.stringify(metas));
}

/** 批量导入协议数据 */
export async function batchImport(env: Env, entries: ProtocolEntry[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    entry.updatedAt = Date.now();
    await env.PROTOCOL_KV.put(VERSION_PREFIX + entry.version, JSON.stringify(entry));
    count++;
  }
  await updateVersionsIndex(env);
  return count;
}

/** 导出所有协议数据 */
export async function exportAllProtocols(env: Env): Promise<ProtocolEntry[]> {
  const versions = await listProtocols(env);
  const entries: ProtocolEntry[] = [];
  for (const meta of versions) {
    const entry = await getProtocol(env, meta.version);
    if (entry) entries.push(entry);
  }
  return entries;
}
