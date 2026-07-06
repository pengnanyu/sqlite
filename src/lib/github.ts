/**
 * Copyright (c) 2024 深圳市德诚四方科技有限公司. All rights reserved.
 */
import type { Env, ProtocolEntry } from '../types';
import { exportAllProtocols, updateVersionsIndex } from './kv';

const GITHUB_API = 'https://api.github.com';

/** 鍚屾鎵€鏈夊崗璁暟鎹埌 GitHub 浠撳簱 */
export async function syncToGitHub(env: Env): Promise<{ success: boolean; message: string; fileCount: number }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { success: false, message: 'GitHub 閰嶇疆缂哄け', fileCount: 0 };
  }

  const entries = await exportAllProtocols(env);
  let fileCount = 0;

  // 1. 鍚屾姣忎釜鐗堟湰涓哄崟鐙?JSON 鏂囦欢
  for (const entry of entries) {
    const path = `protocols/${entry.version}.json`;
    const content = JSON.stringify({
      version: entry.version,
      table: entry.table,
      columns: entry.columns,
      rows: entry.rows,
    }, null, 2);

    const result = await uploadToGithub(env, path, content, `Update protocol ${entry.version}`);
    if (result) fileCount++;
  }

  // 2. 鍚屾绱㈠紩鏂囦欢
  const indexData = entries.map(e => ({
    version: e.version,
    table: e.table,
    rowCount: e.rows.length,
    updatedAt: e.updatedAt,
  }));
  await uploadToGithub(env, 'protocols/index.json', JSON.stringify(indexData, null, 2), 'Update protocol index');

  // 3. 鍚屾瀹屾暣瀵煎嚭鏂囦欢
  const fullExport = JSON.stringify(entries, null, 2);
  await uploadToGithub(env, 'protocols/all.json', fullExport, 'Update full protocol export');

  return {
    success: true,
    message: `宸插悓姝?${fileCount} 涓崗璁増鏈埌 GitHub`,
    fileCount,
  };
}

/** 浠?GitHub 鎷夊彇鎵€鏈夊崗璁暟鎹?*/
export async function syncFromGitHub(env: Env): Promise<{ success: boolean; message: string; count: number }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { success: false, message: 'GitHub 閰嶇疆缂哄け', count: 0 };
  }

  // 鑾峰彇绱㈠紩鏂囦欢
  const indexContent = await fetchGithubFile(env, 'protocols/index.json');
  if (!indexContent) {
    return { success: false, message: 'GitHub 涓婃湭鎵惧埌鍗忚绱㈠紩', count: 0 };
  }

  let index: Array<{ version: string; table: string; rowCount: number; updatedAt: number }>;
  try {
    index = JSON.parse(indexContent);
  } catch {
    return { success: false, message: '鍗忚绱㈠紩鏍煎紡閿欒', count: 0 };
  }

  let count = 0;
  for (const meta of index) {
    const content = await fetchGithubFile(env, `protocols/${meta.version}.json`);
    if (!content) continue;
    try {
      const entry = JSON.parse(content) as ProtocolEntry;
      // 淇濆瓨鍒?KV
      await env.PROTOCOL_KV.put(`proto:version:${entry.version}`, JSON.stringify(entry));
      count++;
    } catch {
      // skip invalid
    }
  }

  // 鏇存柊绱㈠紩

  await updateVersionsIndex(env);

  return {
    success: true,
    message: `浠?GitHub 鎷夊彇浜?${count} 涓崗璁増鏈琡,
    count,
  };
}

/** 涓婁紶鏂囦欢鍒?GitHub */
async function uploadToGithub(env: Env, path: string, content: string, message: string): Promise<boolean> {
  const url = `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`;
  const branch = env.GITHUB_BRANCH || 'main';

  // 鑾峰彇鐜版湁鏂囦欢鐨?SHA锛堝鏋滃瓨鍦級
  let sha: string | undefined;
  try {
    const resp = await fetch(`${url}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (resp.ok) {
      const data = await resp.json() as { sha?: string };
      sha = data.sha;
    }
  } catch {
    // 鏂囦欢鍙兘涓嶅瓨鍦?
  }

  // 涓婁紶
  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  if (sha) body.sha = sha;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return resp.ok;
}

/** 浠?GitHub 鑾峰彇鏂囦欢鍐呭 */
async function fetchGithubFile(env: Env, path: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`;
  const branch = env.GITHUB_BRANCH || 'main';

  try {
    const resp = await fetch(`${url}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw',
      },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}
