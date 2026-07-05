import type { Env, ProtocolEntry } from '../types';
import { exportAllProtocols } from './kv';

const GITHUB_API = 'https://api.github.com';

/** 同步所有协议数据到 GitHub 仓库 */
export async function syncToGitHub(env: Env): Promise<{ success: boolean; message: string; fileCount: number }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { success: false, message: 'GitHub 配置缺失', fileCount: 0 };
  }

  const entries = await exportAllProtocols(env);
  let fileCount = 0;

  // 1. 同步每个版本为单独 JSON 文件
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

  // 2. 同步索引文件
  const indexData = entries.map(e => ({
    version: e.version,
    table: e.table,
    rowCount: e.rows.length,
    updatedAt: e.updatedAt,
  }));
  await uploadToGithub(env, 'protocols/index.json', JSON.stringify(indexData, null, 2), 'Update protocol index');

  // 3. 同步完整导出文件
  const fullExport = JSON.stringify(entries, null, 2);
  await uploadToGithub(env, 'protocols/all.json', fullExport, 'Update full protocol export');

  return {
    success: true,
    message: `已同步 ${fileCount} 个协议版本到 GitHub`,
    fileCount,
  };
}

/** 从 GitHub 拉取所有协议数据 */
export async function syncFromGitHub(env: Env): Promise<{ success: boolean; message: string; count: number }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { success: false, message: 'GitHub 配置缺失', count: 0 };
  }

  // 获取索引文件
  const indexContent = await fetchGithubFile(env, 'protocols/index.json');
  if (!indexContent) {
    return { success: false, message: 'GitHub 上未找到协议索引', count: 0 };
  }

  let index: Array<{ version: string; table: string; rowCount: number; updatedAt: number }>;
  try {
    index = JSON.parse(indexContent);
  } catch {
    return { success: false, message: '协议索引格式错误', count: 0 };
  }

  let count = 0;
  for (const meta of index) {
    const content = await fetchGithubFile(env, `protocols/${meta.version}.json`);
    if (!content) continue;
    try {
      const entry = JSON.parse(content) as ProtocolEntry;
      // 保存到 KV
      await env.PROTOCOL_KV.put(`proto:version:${entry.version}`, JSON.stringify(entry));
      count++;
    } catch {
      // skip invalid
    }
  }

  // 更新索引
  const { updateVersionsIndex } = await import('./kv');
  await updateVersionsIndex(env);

  return {
    success: true,
    message: `从 GitHub 拉取了 ${count} 个协议版本`,
    count,
  };
}

/** 上传文件到 GitHub */
async function uploadToGithub(env: Env, path: string, content: string, message: string): Promise<boolean> {
  const url = `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`;
  const branch = env.GITHUB_BRANCH || 'main';

  // 获取现有文件的 SHA（如果存在）
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
    // 文件可能不存在
  }

  // 上传
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

/** 从 GitHub 获取文件内容 */
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
