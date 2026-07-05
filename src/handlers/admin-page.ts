import type { Env } from '../types';

/** 处理 Admin Web 界面请求（返回静态 HTML） */
export async function handleAdminPage(request: Request, _env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 所有 /admin 路径都返回同一个 SPA
  const html = ADMIN_HTML;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>锂卫士 - 协议数据库管理</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #0f1117; --surface: #1a1d27; --surface2: #252836; --border: #353948;
  --text: #e4e8ef; --text-muted: #888c99; --primary: #3b82f6; --primary-hover: #2563eb;
  --success: #22c55e; --warning: #eab308; --danger: #ef4444; --radius: 8px;
}
body { font-family: -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.login { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-box { background: var(--surface); padding: 32px; border-radius: 16px; width: 360px; max-width: 90vw; }
.login-box h1 { text-align: center; margin-bottom: 24px; font-size: 20px; }
.login-box input { width: 100%; padding: 10px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; margin-bottom: 12px; }
.login-box button { width: 100%; padding: 10px; background: var(--primary); border: none; border-radius: var(--radius); color: #fff; font-size: 14px; cursor: pointer; }
.login-box button:hover { background: var(--primary-hover); }
.login-error { color: var(--danger); font-size: 13px; text-align: center; margin-bottom: 8px; }
.app { display: none; }
.header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 20px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.header h1 { font-size: 16px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.btn { padding: 6px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 13px; cursor: pointer; }
.btn:hover { background: var(--border); }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.layout { display: flex; min-height: calc(100vh - 56px); }
.sidebar { width: 260px; background: var(--surface); border-right: 1px solid var(--border); padding: 16px; overflow-y: auto; }
.sidebar h3 { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
.version-item { padding: 8px 12px; border-radius: var(--radius); cursor: pointer; margin-bottom: 4px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
.version-item:hover { background: var(--surface2); }
.version-item.active { background: var(--primary); color: #fff; }
.version-item .badge { font-size: 10px; background: var(--border); padding: 1px 6px; border-radius: 4px; }
.version-item.active .badge { background: rgba(255,255,255,0.2); }
.main { flex: 1; padding: 20px; overflow: auto; }
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.table-wrap { background: var(--surface); border-radius: var(--radius); overflow: auto; border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: var(--surface2); padding: 8px 12px; text-align: left; position: sticky; top: 0; border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
tr:hover { background: var(--surface2); }
td.editable { cursor: text; }
td.editing { background: var(--bg); }
td.selected { background: rgba(59,130,246,0.15); }
input.cell-input { width: 100%; padding: 2px 4px; background: transparent; border: 1px solid var(--primary); border-radius: 3px; color: var(--text); font-size: 13px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 200; }
.modal-overlay.show { display: flex; }
.modal { background: var(--surface); border-radius: 12px; padding: 24px; width: 480px; max-width: 90vw; max-height: 80vh; overflow: auto; }
.modal h2 { font-size: 18px; margin-bottom: 16px; }
.modal-field { margin-bottom: 12px; }
.modal-field label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
.modal-field input, .modal-field select { width: 100%; padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: var(--radius); font-size: 14px; z-index: 300; animation: slideUp 0.3s; }
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--danger); color: #fff; }
.toast.info { background: var(--primary); color: #fff; }
@keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
.empty { text-align: center; padding: 40px; color: var(--text-muted); }
.user-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.role-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.role-admin { background: var(--danger); color: #fff; }
.role-editor { background: var(--warning); color: #000; }
.role-viewer { background: var(--text-muted); color: #fff; }
.context-menu { position: fixed; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; z-index: 300; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.context-menu button { display: block; width: 100%; text-align: left; padding: 6px 12px; background: none; border: none; color: var(--text); font-size: 13px; cursor: pointer; border-radius: 4px; }
.context-menu button:hover { background: var(--border); }
.context-menu button.danger { color: var(--danger); }
</style>
</head>
<body>

<!-- 登录页 -->
<div class="login" id="loginPage">
  <div class="login-box">
    <h1>锂卫士 - 协议数据库管理</h1>
    <div class="login-error" id="loginError"></div>
    <input type="text" id="loginUser" placeholder="用户名" autocomplete="username">
    <input type="password" id="loginPass" placeholder="密码" autocomplete="current-password">
    <button onclick="doLogin()">登录</button>
    <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">默认: admin / admin123</p>
  </div>
</div>

<!-- 主应用 -->
<div class="app" id="app">
  <div class="header">
    <h1>锂卫士 - 协议数据库管理</h1>
    <div class="header-actions">
      <span id="userInfo" style="font-size:13px;color:var(--text-muted)"></span>
      <button class="btn btn-sm" onclick="showImportModal()">导入</button>
      <button class="btn btn-sm" onclick="exportData()">导出</button>
      <button class="btn btn-sm" id="syncBtn" onclick="syncGithub('push')">同步到GitHub</button>
      <button class="btn btn-sm" onclick="syncGithub('pull')">从GitHub拉取</button>
      <button class="btn btn-sm" onclick="showUsersModal()">用户管理</button>
      <button class="btn btn-sm" onclick="doLogout()">退出</button>
    </div>
  </div>
  <div class="layout">
    <div class="sidebar">
      <h3>协议版本</h3>
      <div id="versionList"></div>
      <button class="btn btn-sm" style="margin-top:8px;width:100%" onclick="showNewVersionModal()">+ 新建版本</button>
    </div>
    <div class="main" id="mainContent">
      <div class="empty">请选择或创建一个协议版本</div>
    </div>
  </div>
</div>

<!-- 导入弹窗 -->
<div class="modal-overlay" id="importModal">
  <div class="modal">
    <h2>导入协议数据</h2>
    <div class="modal-field">
      <label>格式</label>
      <select id="importFormat">
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
      </select>
    </div>
    <div class="modal-field">
      <label>版本号（CSV 必填，JSON 可选）</label>
      <input type="text" id="importVersion" placeholder="如 7030">
    </div>
    <div class="modal-field">
      <label>表名（可选）</label>
      <input type="text" id="importTable" placeholder="表名">
    </div>
    <div class="modal-field">
      <label>文件</label>
      <input type="file" id="importFile" accept=".json,.csv">
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('importModal')">取消</button>
      <button class="btn btn-primary" onclick="doImport()">导入</button>
    </div>
  </div>
</div>

<!-- 新建版本弹窗 -->
<div class="modal-overlay" id="newVersionModal">
  <div class="modal">
    <h2>新建协议版本</h2>
    <div class="modal-field">
      <label>版本号</label>
      <input type="text" id="newVersion" placeholder="如 7030">
    </div>
    <div class="modal-field">
      <label>表名</label>
      <input type="text" id="newTable" placeholder="表名">
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('newVersionModal')">取消</button>
      <button class="btn btn-primary" onclick="createVersion()">创建</button>
    </div>
  </div>
</div>

<!-- 用户管理弹窗 -->
<div class="modal-overlay" id="usersModal">
  <div class="modal">
    <h2>用户管理</h2>
    <div id="userList"></div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <h3 style="font-size:14px;margin-bottom:8px">添加用户</h3>
      <div class="modal-field">
        <label>用户名</label>
        <input type="text" id="newUsername" placeholder="用户名">
      </div>
      <div class="modal-field">
        <label>密码</label>
        <input type="password" id="newUserPass" placeholder="密码">
      </div>
      <div class="modal-field">
        <label>角色</label>
        <select id="newUserRole">
          <option value="viewer">查看者（只读）</option>
          <option value="editor">编辑者（可编辑）</option>
          <option value="admin">管理员（全部权限）</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="addUser()">添加</button>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('usersModal')">关闭</button>
    </div>
  </div>
</div>

<!-- 右键菜单 -->
<div class="context-menu" id="contextMenu">
  <button onclick="insertRowAbove()">上方插入行</button>
  <button onclick="insertRowBelow()">下方插入行</button>
  <button onclick="copyRows()">复制选中行</button>
  <button onclick="pasteRows()">粘贴行</button>
  <button class="danger" onclick="deleteRows()">删除选中行</button>
</div>

<script>
let token = localStorage.getItem('bms_token') || '';
let currentUser = null;
let versions = [];
let currentVersion = null;
let currentData = null;
let selectedRows = new Set();
let copiedRows = [];
let contextRowIndex = -1;

// ===== 登录 =====
async function doLogin() {
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  document.getElementById('loginError').textContent = '';
  try {
    const resp = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.success) {
      token = data.data.token;
      localStorage.setItem('bms_token', token);
      currentUser = data.data;
      showApp();
    } else {
      document.getElementById('loginError').textContent = data.error || '登录失败';
    }
  } catch(e) {
    document.getElementById('loginError').textContent = '网络错误';
  }
}

async function doLogout() {
  try { await fetch('/api/admin/logout', { method: 'POST', headers: authHeaders() }); } catch(e) {}
  token = '';
  localStorage.removeItem('bms_token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function checkSession() {
  if (!token) return false;
  try {
    const resp = await fetch('/api/admin/session', { headers: authHeaders() });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.success) {
      currentUser = data.data;
      return true;
    }
  } catch(e) {}
  return false;
}

// ===== 应用主流程 =====
async function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userInfo').textContent = currentUser.username + ' (' + currentUser.role + ')';
  // 只读用户隐藏管理按钮
  if (currentUser.role === 'viewer') {
    document.querySelectorAll('.btn-primary, .btn-danger').forEach(b => b.style.display = 'none');
    document.getElementById('syncBtn').style.display = 'none';
  }
  await loadVersions();
}

async function loadVersions() {
  try {
    const resp = await fetch('/api/admin/protocols', { headers: authHeaders() });
    const data = await resp.json();
    if (data.success) {
      versions = data.data || [];
      renderVersionList();
    }
  } catch(e) { showToast('加载失败', 'error'); }
}

function renderVersionList() {
  const el = document.getElementById('versionList');
  if (versions.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">暂无版本</div>';
    return;
  }
  el.innerHTML = versions.map(v =>
    '<div class="version-item' + (currentVersion === v.version ? ' active' : '') + '" onclick="selectVersion(\\''+v.version+'\\')">' +
    '<span>'+v.version+'</span><span class="badge">'+v.rowCount+'行</span></div>'
  ).join('');
}

async function selectVersion(version) {
  currentVersion = version;
  renderVersionList();
  try {
    const resp = await fetch('/api/admin/protocols/' + encodeURIComponent(version), { headers: authHeaders() });
    const data = await resp.json();
    if (data.success) {
      currentData = data.data;
      renderTable();
    }
  } catch(e) { showToast('加载失败', 'error'); }
}

function renderTable() {
  if (!currentData) return;
  const main = document.getElementById('mainContent');
  const cols = currentData.columns || [];
  const rows = currentData.rows || [];
  const canEdit = currentUser.role !== 'viewer';

  let html = '<div class="toolbar">';
  html += '<span style="font-size:14px;font-weight:600">'+currentData.version+'</span>';
  html += '<span style="font-size:12px;color:var(--text-muted)">'+(currentData.table||'')+' · '+rows.length+'行 · '+cols.length+'列</span>';
  if (canEdit) {
    html += '<button class="btn btn-sm btn-primary" onclick="addRow()">+ 添加行</button>';
    html += '<button class="btn btn-sm" onclick="addColumn()">+ 添加列</button>';
    html += '<button class="btn btn-sm btn-danger" onclick="deleteVersion()">删除版本</button>';
  }
  html += '<button class="btn btn-sm" onclick="selectVersion(\\''+currentVersion+'\\')">刷新</button>';
  html += '</div>';

  html += '<div class="table-wrap"><table><thead><tr>';
  cols.forEach((col, i) => {
    html += '<th>' + (canEdit ? '<span onclick="renameColumn('+i+')" style="cursor:pointer">'+col+'</span>' : col) + '</th>';
  });
  if (canEdit) html += '<th style="width:40px"></th>';
  html += '</tr></thead><tbody>';
  rows.forEach((row, ri) => {
    html += '<tr data-row="'+ri+'">';
    cols.forEach((col, ci) => {
      const val = row[col] !== undefined ? String(row[col]) : '';
      html += '<td class="' + (canEdit ? 'editable' : '') + '" data-row="'+ri+'" data-col="'+ci+'" ' + (canEdit ? 'ondblclick="editCell(this)"' : '') + '>' + escapeHtml(val) + '</td>';
    });
    if (canEdit) html += '<td><input type="checkbox" onchange="toggleRow('+ri+', this.checked)"></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  main.innerHTML = html;

  // 右键菜单
  if (canEdit) {
    main.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextRowIndex = parseInt(tr.dataset.row);
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        if (!selectedRows.has(contextRowIndex)) {
          selectedRows.clear();
          selectedRows.add(contextRowIndex);
          updateRowSelection();
        }
      });
    });
  }
}

document.addEventListener('click', () => {
  document.getElementById('contextMenu').style.display = 'none';
});

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 单元格编辑 =====
function editCell(td) {
  if (td.classList.contains('editing')) return;
  td.classList.add('editing');
  const ri = parseInt(td.dataset.row);
  const ci = parseInt(td.dataset.col);
  const col = currentData.columns[ci];
  const oldVal = String(currentData.rows[ri][col] || '');
  td.innerHTML = '<input class="cell-input" value="'+escapeHtml(oldVal)+'">';
  const input = td.querySelector('input');
  input.focus();
  input.select();
  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const newVal = input.value;
    td.classList.remove('editing');
    td.innerHTML = escapeHtml(newVal);
    if (newVal !== oldVal) {
      currentData.rows[ri][col] = newVal;
      saveData();
    }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { saved = true; td.classList.remove('editing'); td.innerHTML = escapeHtml(oldVal); }
  });
}

async function saveData() {
  try {
    const resp = await fetch('/api/admin/protocols/' + encodeURIComponent(currentVersion), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(currentData)
    });
    const data = await resp.json();
    if (data.success) {
      showToast('已保存', 'success');
      await loadVersions();
    } else {
      showToast(data.error || '保存失败', 'error');
    }
  } catch(e) { showToast('保存失败', 'error'); }
}

// ===== 行操作 =====
function toggleRow(ri, checked) {
  if (checked) selectedRows.add(ri);
  else selectedRows.delete(ri);
  updateRowSelection();
}

function updateRowSelection() {
  document.querySelectorAll('tbody tr').forEach(tr => {
    const ri = parseInt(tr.dataset.row);
    tr.querySelectorAll('td').forEach(td => {
      td.classList.toggle('selected', selectedRows.has(ri));
    });
    const cb = tr.querySelector('input[type=checkbox]');
    if (cb) cb.checked = selectedRows.has(ri);
  });
}

function insertRowAbove() {
  insertRow(contextRowIndex, 'above');
}
function insertRowBelow() {
  insertRow(contextRowIndex + 1, 'below');
}
function insertRow(index) {
  if (!currentData) return;
  const newRow = {};
  currentData.columns.forEach(c => newRow[c] = '');
  currentData.rows.splice(index, 0, newRow);
  renderTable();
  saveData();
}

function addRow() {
  if (!currentData) return;
  const newRow = {};
  currentData.columns.forEach(c => newRow[c] = '');
  currentData.rows.push(newRow);
  renderTable();
  saveData();
}

function copyRows() {
  if (selectedRows.size === 0) { showToast('未选中行', 'error'); return; }
  copiedRows = Array.from(selectedRows).sort((a,b) => a-b).map(ri => ({...currentData.rows[ri]}));
  showToast('已复制 ' + copiedRows.length + ' 行', 'info');
}

function pasteRows() {
  if (copiedRows.length === 0) { showToast('剪贴板为空', 'error'); return; }
  if (!currentData) return;
  const insertAt = contextRowIndex >= 0 ? contextRowIndex + 1 : currentData.rows.length;
  currentData.rows.splice(insertAt, 0, ...copiedRows.map(r => ({...r})));
  renderTable();
  saveData();
}

function deleteRows() {
  if (selectedRows.size === 0) { showToast('未选中行', 'error'); return; }
  if (!confirm('确认删除 ' + selectedRows.size + ' 行？')) return;
  const indices = Array.from(selectedRows).sort((a,b) => b-a);
  indices.forEach(ri => currentData.rows.splice(ri, 1));
  selectedRows.clear();
  renderTable();
  saveData();
}

// ===== 列操作 =====
function addColumn() {
  if (!currentData) return;
  const name = prompt('列名:');
  if (!name) return;
  currentData.columns.push(name);
  currentData.rows.forEach(r => r[name] = '');
  renderTable();
  saveData();
}

function renameColumn(ci) {
  if (!currentData) return;
  const oldName = currentData.columns[ci];
  const newName = prompt('重命名列:', oldName);
  if (!newName || newName === oldName) return;
  currentData.columns[ci] = newName;
  currentData.rows.forEach(r => {
    r[newName] = r[oldName];
    delete r[oldName];
  });
  renderTable();
  saveData();
}

// ===== 版本操作 =====
function showNewVersionModal() { document.getElementById('newVersionModal').classList.add('show'); }

async function createVersion() {
  const version = document.getElementById('newVersion').value.trim();
  const table = document.getElementById('newTable').value.trim();
  if (!version) { showToast('请输入版本号', 'error'); return; }
  try {
    const resp = await fetch('/api/admin/protocols/' + encodeURIComponent(version), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ version, table, columns: [], rows: [] })
    });
    const data = await resp.json();
    if (data.success) {
      closeModal('newVersionModal');
      document.getElementById('newVersion').value = '';
      document.getElementById('newTable').value = '';
      showToast('已创建', 'success');
      await loadVersions();
      selectVersion(version);
    } else {
      showToast(data.error || '创建失败', 'error');
    }
  } catch(e) { showToast('创建失败', 'error'); }
}

async function deleteVersion() {
  if (!currentVersion) return;
  if (!confirm('确认删除版本 ' + currentVersion + '？此操作不可恢复！')) return;
  try {
    const resp = await fetch('/api/admin/protocols/' + encodeURIComponent(currentVersion), {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await resp.json();
    if (data.success) {
      showToast('已删除', 'success');
      currentVersion = null;
      currentData = null;
      document.getElementById('mainContent').innerHTML = '<div class="empty">请选择或创建一个协议版本</div>';
      await loadVersions();
    } else {
      showToast(data.error || '删除失败', 'error');
    }
  } catch(e) { showToast('删除失败', 'error'); }
}

// ===== 导入导出 =====
function showImportModal() { document.getElementById('importModal').classList.add('show'); }

async function doImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file) { showToast('请选择文件', 'error'); return; }
  const format = document.getElementById('importFormat').value;
  const version = document.getElementById('importVersion').value.trim();
  const table = document.getElementById('importTable').value.trim();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  formData.append('version', version);
  formData.append('table', table);

  try {
    const resp = await fetch('/api/admin/protocols/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await resp.json();
    if (data.success) {
      closeModal('importModal');
      showToast(data.message, 'success');
      await loadVersions();
    } else {
      showToast(data.error || '导入失败', 'error');
    }
  } catch(e) { showToast('导入失败', 'error'); }
}

async function exportData() {
  const format = confirm('点击确定导出JSON，取消导出CSV') ? 'json' : 'csv';
  window.open('/api/admin/protocols/export?format=' + format + '&token=' + token, '_blank');
}

// ===== GitHub 同步 =====
async function syncGithub(direction) {
  showToast(direction === 'push' ? '正在同步到 GitHub...' : '正在从 GitHub 拉取...', 'info');
  try {
    const resp = await fetch('/api/admin/protocols/sync-github?direction=' + direction, {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await resp.json();
    if (data.success) {
      showToast(data.message, 'success');
      if (direction === 'pull') await loadVersions();
    } else {
      showToast(data.error || data.message || '同步失败', 'error');
    }
  } catch(e) { showToast('同步失败', 'error'); }
}

// ===== 用户管理 =====
async function showUsersModal() {
  if (currentUser.role !== 'admin') { showToast('仅管理员可管理用户', 'error'); return; }
  document.getElementById('usersModal').classList.add('show');
  try {
    const resp = await fetch('/api/admin/users', { headers: authHeaders() });
    const data = await resp.json();
    if (data.success) {
      const el = document.getElementById('userList');
      el.innerHTML = data.data.map(u =>
        '<div class="user-row"><div><span>'+u.username+'</span> <span class="role-badge role-'+u.role+'">'+u.role+'</span></div>' +
        (u.id !== currentUser.userId ? '<button class="btn btn-sm btn-danger" onclick="deleteUser(\\''+u.id+'\\')">删除</button>' : '') +
        '</div>'
      ).join('');
    }
  } catch(e) {}
}

async function addUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newUserPass').value;
  const role = document.getElementById('newUserRole').value;
  if (!username || !password) { showToast('用户名和密码不能为空', 'error'); return; }
  try {
    const resp = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username, password, role })
    });
    const data = await resp.json();
    if (data.success) {
      showToast('用户已添加', 'success');
      document.getElementById('newUsername').value = '';
      document.getElementById('newUserPass').value = '';
      showUsersModal();
    } else {
      showToast(data.error || '添加失败', 'error');
    }
  } catch(e) { showToast('添加失败', 'error'); }
}

async function deleteUser(id) {
  if (!confirm('确认删除此用户？')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id, { method: 'DELETE', headers: authHeaders() });
    const data = await resp.json();
    if (data.success) { showToast('已删除', 'success'); showUsersModal(); }
    else { showToast(data.error || '删除失败', 'error'); }
  } catch(e) { showToast('删除失败', 'error'); }
}

// ===== 工具 =====
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'c' && selectedRows.size > 0 && !e.target.matches('input')) {
    e.preventDefault(); copyRows();
  }
  if (e.ctrlKey && e.key === 'v' && copiedRows.length > 0 && !e.target.matches('input')) {
    e.preventDefault(); pasteRows();
  }
  if (e.key === 'Delete' && selectedRows.size > 0 && !e.target.matches('input')) {
    e.preventDefault(); deleteRows();
  }
});

// ===== 初始化 =====
(async function() {
  if (await checkSession()) {
    showApp();
  } else {
    token = '';
    localStorage.removeItem('bms_token');
  }
})();

// 回车登录
document.getElementById('loginPass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
</script>
</body>
</html>`;
