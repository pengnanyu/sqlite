/**
 * Copyright (c) 2024 深圳市德诚四方科技有限公司. All rights reserved.
 */
import type { ProtocolEntry, ProtocolMeta, Env } from '../types';

const VERSIONS_KEY = 'proto:versions';
const VERSION_PREFIX = 'proto:version:';

/** 鑾峰彇鎵€鏈夊崗璁増鏈厓鏁版嵁鍒楄〃 */
export async function listProtocols(env: Env): Promise<ProtocolMeta[]> {
  const raw = await env.PROTOCOL_KV.get(VERSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProtocolMeta[];
  } catch {
    return [];
  }
}

/** 鑾峰彇鎸囧畾鐗堟湰鐨勫畬鏁村崗璁暟鎹?*/
export async function getProtocol(env: Env, version: string): Promise<ProtocolEntry | null> {
  const raw = await env.PROTOCOL_KV.get(VERSION_PREFIX + version);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProtocolEntry;
  } catch {
    return null;
  }
}

/** 鍏煎鏃?API锛氭寜 search 鏌ヨ */
export async function searchProtocol(env: Env, search: string): Promise<ProtocolEntry | null> {
  // 绮剧‘鍖归厤
  const exact = await getProtocol(env, search);
  if (exact) return exact;

  // 妯＄硦鍖归厤
  const versions = await listProtocols(env);
  const match = versions.find(v =>
    v.version.toLowerCase().includes(search.toLowerCase())
  );
  if (match) {
    return getProtocol(env, match.version);
  }
  return null;
}

/** 淇濆瓨/鏇存柊鍗忚鏁版嵁 */
export async function putProtocol(env: Env, entry: ProtocolEntry): Promise<void> {
  entry.updatedAt = Date.now();
  await env.PROTOCOL_KV.put(VERSION_PREFIX + entry.version, JSON.stringify(entry));
  await updateVersionsIndex(env);
}

/** 鍒犻櫎鍗忚鏁版嵁 */
export async function deleteProtocol(env: Env, version: string): Promise<void> {
  await env.PROTOCOL_KV.delete(VERSION_PREFIX + version);
  await updateVersionsIndex(env);
}

/** 鏇存柊鐗堟湰绱㈠紩 */
export async function updateVersionsIndex(env: Env): Promise<void> {
  // KV 娌℃湁鍒楀嚭鎵€鏈?key 鐨勫ソ鏂规硶锛屾墍浠ユ垜浠淮鎶や竴涓储寮?
  // 鍏堝皾璇?list API
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

/** 鎵归噺瀵煎叆鍗忚鏁版嵁 */
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

/** 瀵煎嚭鎵€鏈夊崗璁暟鎹?*/
export async function exportAllProtocols(env: Env): Promise<ProtocolEntry[]> {
  const versions = await listProtocols(env);
  const entries: ProtocolEntry[] = [];
  for (const meta of versions) {
    const entry = await getProtocol(env, meta.version);
    if (entry) entries.push(entry);
  }
  return entries;
}
