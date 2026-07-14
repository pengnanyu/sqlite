let SQL = null;
let dbInstances = {};
let currentDb = null;
let currentTable = null;
let tableData = { columns: [], results: [], total: 0, page: 1, limit: 200 };
let selectedRows = new Set();
let clipboardRows = [];
let editingCell = null;
let saveTimer = null;

async function initSQL() {
  if (SQL) return SQL;
  try {
    SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });
  } catch (e) {
    console.error('sql.js init failed:', e);
  }
  return SQL;
}

async function loadDb(name) {
  if (dbInstances[name]) return dbInstances[name];
  const sql = await initSQL();
  if (!sql) return null;
  const saved = await IDB.get(`db:${name}`);
  let db;
  if (saved && saved.length > 0) {
    db = new sql.Database(new Uint8Array(saved));
  } else {
    db = new sql.Database();
  }
  dbInstances[name] = db;
  return db;
}

async function saveDb(name) {
  const db = dbInstances[name];
  if (!db) return;
  const data = db.export();
  await IDB.put(`db:${name}`, Array.from(data));
}

function debounceSave(name) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDb(name), 500);
}

function queryDb(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      const row = {};
      const values = stmt.get();
      columns.forEach((col, i) => { row[col] = values[i]; });
      results.push(row);
    }
    stmt.free();
    return { columns, results };
  } catch (e) {
    return { columns: [], results: [], error: e.message };
  }
}

function $(sel) { return document.querySelector(sel); }

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

function showModal(title, content, actions) {
  const existing = $('.modal-overlay');
  if (existing) existing.remove();
  const overlay = el('div', { className: 'modal-overlay' });
  const modal = el('div', { className: 'modal' });
  modal.appendChild(el('h3', { textContent: title }));
  if (typeof content === 'string') modal.appendChild(el('div', { innerHTML: content }));
  else if (content) modal.appendChild(content);
  if (actions) {
    const bar = el('div', { className: 'modal-actions' });
    for (const a of actions) bar.appendChild(a);
    modal.appendChild(bar);
  }
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
}

function render() {
  const app = $('#app');
  app.innerHTML = '';
  app.appendChild(renderLayout());
}

function renderLayout() {
  return el('div', { className: 'layout' }, [renderSidebar(), renderMain()]);
}

function renderSidebar() {
  const sidebar = el('div', { className: 'sidebar' });
  sidebar.appendChild(el('div', { className: 'sidebar-header' }, [
    el('h2', { textContent: 'SQLite Online' }),
    el('button', { className: 'btn btn-sm btn-primary', textContent: '+ 新建', onClick: showCreateDbDialog }),
  ]));
  sidebar.appendChild(el('div', { className: 'db-list', id: 'db-list' }));
  return sidebar;
}

function showCreateDbDialog() {
  const input = el('input', { type: 'text', id: 'new-db-name', placeholder: '输入数据库名称', className: 'input-sm', style: { width: '100%' } });
  const overlay = showModal('新建数据库', input, [
    el('button', { className: 'btn', textContent: '取消', onClick: closeModals }),
    el('button', { className: 'btn btn-primary', textContent: '创建', onClick: async () => {
      const name = input.value?.trim();
      if (!name) return;
      const db = await loadDb(name);
      if (!db) { alert('初始化失败'); return; }
      await saveDb(name);
      currentDb = name;
      currentTable = null;
      selectedRows.clear();
      closeModals();
      render();
      await refreshSidebar();
    }}),
  ]);
  setTimeout(() => { input.focus(); }, 100);
}

async function refreshSidebar() {
  const container = $('#db-list');
  if (!container) return;
  const keys = await IDB.list('db:');
  const databases = keys.map(k => k.replace('db:', ''));
  container.innerHTML = '';
  if (databases.length === 0) {
    container.appendChild(el('div', { className: 'sidebar-empty', textContent: '暂无数据库' }));
    return;
  }
  for (const db of databases) {
    const item = el('div', { className: `db-item ${db === currentDb ? 'active' : ''}` });
    item.appendChild(el('span', { className: 'db-name', textContent: db, onClick: () => selectDb(db) }));
    item.appendChild(el('button', { className: 'btn-icon btn-danger-sm', textContent: '\u00d7', onClick: (e) => { e.stopPropagation(); deleteDatabase(db); } }));
    if (db === currentDb) {
      const dbObj = dbInstances[db];
      let tables = [];
      if (dbObj) {
        const data = queryDb(dbObj, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        tables = data.results.map(r => r.name);
      }
      const tableList = el('div', { className: 'table-list' });
      for (const t of tables) {
        tableList.appendChild(el('div', {
          className: `table-item ${t === currentTable ? 'active' : ''}`,
          textContent: t,
          onClick: () => selectTable(t),
        }));
      }
      item.appendChild(tableList);
    }
    container.appendChild(item);
  }
}

async function selectDb(db) {
  currentDb = db;
  currentTable = null;
  selectedRows.clear();
  await loadDb(db);
  render();
  await refreshSidebar();
}

async function selectTable(table) {
  currentTable = table;
  selectedRows.clear();
  loadTableData();
  render();
}

function loadTableData(page = 1) {
  if (!currentDb || !currentTable) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  const limit = tableData.limit || 200;
  const offset = (page - 1) * limit;
  const countResult = queryDb(db, `SELECT COUNT(*) as cnt FROM "${currentTable}"`);
  const total = countResult.results[0]?.cnt || 0;
  const data = queryDb(db, `SELECT * FROM "${currentTable}" LIMIT ? OFFSET ?`, [limit, offset]);
  tableData = { ...data, total, page, limit };
}

async function deleteDatabase(db) {
  if (!confirm(`确定删除数据库 "${db}"？`)) return;
  if (dbInstances[db]) { dbInstances[db].close(); delete dbInstances[db]; }
  await IDB.delete(`db:${db}`);
  if (currentDb === db) { currentDb = null; currentTable = null; }
  render();
  await refreshSidebar();
}

function renderMain() {
  const main = el('div', { className: 'main' }, []);
  if (!currentDb) {
    main.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-icon', innerHTML: '&#128451;' }),
      el('h3', { textContent: '选择或创建数据库' }),
      el('p', { textContent: '从左侧选择数据库，或点击"新建"创建' }),
      el('div', { className: 'empty-actions' }, [
        el('button', { className: 'btn btn-primary', textContent: '新建数据库', onClick: showCreateDbDialog }),
        el('button', { className: 'btn', textContent: '导入文件', onClick: showImportDialog }),
      ]),
    ]));
    return main;
  }
  main.appendChild(renderToolbar());
  if (currentTable) {
    main.appendChild(renderTableView());
    main.appendChild(renderPagination());
  } else {
    main.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-icon', innerHTML: '&#128203;' }),
      el('h3', { textContent: '选择数据表' }),
      el('div', { className: 'empty-actions' }, [
        el('button', { className: 'btn btn-primary', textContent: '新建表', onClick: showCreateTableDialog }),
        el('button', { className: 'btn', textContent: '导入文件', onClick: showImportDialog }),
      ]),
    ]));
  }
  return main;
}

function renderToolbar() {
  const right = [
    el('button', { className: 'btn btn-sm', textContent: '新建表', onClick: showCreateTableDialog }),
    el('button', { className: 'btn btn-sm', textContent: '导入', onClick: showImportDialog }),
    el('button', { className: 'btn btn-sm', textContent: '导出', onClick: exportDb }),
    el('button', { className: 'btn btn-sm', textContent: 'SQL', onClick: showSqlEditor }),
  ];
  if (currentTable) {
    right.push(el('button', { className: 'btn btn-sm btn-danger', textContent: '删表', onClick: dropTable }));
  }
  if (selectedRows.size > 0) {
    right.push(el('button', { className: 'btn btn-sm btn-danger', textContent: `删除(${selectedRows.size})`, onClick: deleteSelected }));
    right.push(el('button', { className: 'btn btn-sm', textContent: '复制', onClick: copySelected }));
  }
  if (clipboardRows.length > 0) {
    right.push(el('button', { className: 'btn btn-sm', textContent: `粘贴(${clipboardRows.length})`, onClick: pasteRows }));
  }
  return el('div', { className: 'toolbar' }, [
    el('div', { className: 'toolbar-left' }, [
      el('span', { className: 'toolbar-db', textContent: currentDb }),
      currentTable ? el('span', { className: 'toolbar-table', textContent: ` / ${currentTable}` }) : null,
    ]),
    el('div', { className: 'toolbar-right' }, right),
  ]);
}

function showCreateTableDialog() {
  const nameInput = el('input', { type: 'text', id: 'new-table-name', placeholder: '表名称', className: 'input-sm', style: { width: '100%', marginBottom: '8px' } });
  const colInput = el('input', { type: 'text', id: 'new-table-cols', placeholder: '列定义 (如: id INTEGER PRIMARY KEY, name TEXT, value REAL)', className: 'input-sm', style: { width: '100%' } });
  const content = el('div', {}, [nameInput, colInput]);
  showModal('新建表', content, [
    el('button', { className: 'btn', textContent: '取消', onClick: closeModals }),
    el('button', { className: 'btn btn-primary', textContent: '创建', onClick: async () => {
      const name = nameInput.value?.trim();
      const colDef = colInput.value?.trim();
      if (!name) return;
      const db = dbInstances[currentDb];
      if (!db) return;
      const sql = colDef ? `CREATE TABLE IF NOT EXISTS "${name}" (${colDef})` : `CREATE TABLE IF NOT EXISTS "${name}" (id INTEGER PRIMARY KEY AUTOINCREMENT)`;
      try {
        db.run(sql);
        await saveDb(currentDb);
        currentTable = name;
        loadTableData();
        closeModals();
        render();
        await refreshSidebar();
      } catch (e) {
        alert('建表失败: ' + e.message);
      }
    }}),
  ]);
  setTimeout(() => { nameInput.focus(); }, 100);
}

async function dropTable() {
  if (!confirm(`确定删除表 "${currentTable}"？`)) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  db.run(`DROP TABLE IF EXISTS "${currentTable}"`);
  await saveDb(currentDb);
  currentTable = null;
  render();
  await refreshSidebar();
}

async function exportDb() {
  const db = dbInstances[currentDb];
  if (!db) return;
  const data = db.export();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${currentDb}.db`; a.click();
  URL.revokeObjectURL(url);
}

function renderTableView() {
  const container = el('div', { className: 'table-container' });
  if (!tableData.columns || tableData.columns.length === 0) {
    container.appendChild(el('div', { className: 'empty-state', textContent: '空表 - 双击单元格可编辑' }));
    return container;
  }
  const table = el('table', { className: 'data-table' });
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', { className: 'th-select' }, [
    el('input', { type: 'checkbox', onChange: (e) => toggleSelectAll(e.target.checked) }),
  ]));
  for (const col of tableData.columns) {
    headerRow.appendChild(el('th', { textContent: col }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (let i = 0; i < tableData.results.length; i++) {
    const row = tableData.results[i];
    const tr = el('tr', { className: selectedRows.has(i) ? 'selected' : '' });
    tr.appendChild(el('td', { className: 'td-select' }, [
      el('input', { type: 'checkbox', checked: selectedRows.has(i), onChange: () => toggleSelectRow(i) }),
    ]));
    for (const col of tableData.columns) {
      const val = row[col];
      const td = el('td', {
        textContent: val === null ? 'NULL' : String(val),
        className: val === null ? 'null-val' : '',
      });
      td.addEventListener('dblclick', () => startEditCell(i, col, td));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function toggleSelectAll(checked) {
  if (checked) { for (let i = 0; i < tableData.results.length; i++) selectedRows.add(i); }
  else { selectedRows.clear(); }
  render();
}

function toggleSelectRow(idx) {
  if (selectedRows.has(idx)) selectedRows.delete(idx); else selectedRows.add(idx);
  render();
}

function startEditCell(rowIdx, col, td) {
  if (editingCell) return;
  const row = tableData.results[rowIdx];
  const val = row[col];
  editingCell = { rowIdx, col, originalValue: val };
  const input = el('input', { type: 'text', value: val === null ? '' : String(val), className: 'cell-editor' });
  input.addEventListener('blur', () => finishEditCell(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishEditCell(input); }
    if (e.key === 'Escape') { editingCell = null; render(); }
  });
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();
}

async function finishEditCell(input) {
  if (!editingCell) return;
  const { rowIdx, col, originalValue } = editingCell;
  const newVal = input.value === '' ? null : input.value;
  editingCell = null;
  if (newVal === originalValue || (newVal !== null && String(originalValue) === String(newVal))) {
    render(); return;
  }
  const db = dbInstances[currentDb];
  if (!db) { render(); return; }
  const row = tableData.results[rowIdx];
  const whereParts = [];
  const whereVals = [];
  for (const c of tableData.columns) {
    if (c === col) continue;
    whereParts.push(`"${c}" = ?`);
    whereVals.push(row[c]);
  }
  try {
    db.run(`UPDATE "${currentTable}" SET "${col}" = ? WHERE ${whereParts.join(' AND ')}`, [newVal, ...whereVals]);
    row[col] = newVal;
    debounceSave(currentDb);
  } catch (e) {
    alert('更新失败: ' + e.message);
  }
  render();
}

async function deleteSelected() {
  if (selectedRows.size === 0) return;
  if (!confirm(`确定删除 ${selectedRows.size} 行？`)) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  for (const idx of selectedRows) {
    const row = tableData.results[idx];
    const whereParts = [];
    const whereVals = [];
    for (const c of tableData.columns) {
      whereParts.push(`"${c}" = ?`);
      whereVals.push(row[c]);
    }
    db.run(`DELETE FROM "${currentTable}" WHERE ${whereParts.join(' AND ')}`, whereVals);
  }
  selectedRows.clear();
  await saveDb(currentDb);
  loadTableData(tableData.page);
  render();
}

function copySelected() {
  if (selectedRows.size === 0) return;
  clipboardRows = [];
  const sorted = [...selectedRows].sort((a, b) => a - b);
  for (const idx of sorted) clipboardRows.push({ ...tableData.results[idx] });
  const text = clipboardRows.map(r => tableData.columns.map(c => r[c] === null ? '' : String(r[c])).join('\t')).join('\n');
  navigator.clipboard.writeText(text).catch(() => {});
  render();
}

async function pasteRows() {
  if (clipboardRows.length === 0 || !currentTable) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  for (const row of clipboardRows) {
    const cols = Object.keys(row).map(c => `"${c}"`).join(',');
    const vals = Object.values(row);
    const ph = vals.map(() => '?').join(',');
    db.run(`INSERT INTO "${currentTable}" (${cols}) VALUES (${ph})`, vals);
  }
  await saveDb(currentDb);
  loadTableData(tableData.page);
  render();
}

function renderPagination() {
  if (!tableData.total) return el('div');
  const totalPages = Math.ceil(tableData.total / (tableData.limit || 200));
  return el('div', { className: 'pagination' }, [
    el('span', { className: 'page-info', textContent: `${tableData.total} 行 \u00b7 第 ${tableData.page}/${totalPages} 页` }),
    el('button', { className: 'btn btn-sm', textContent: '上一页', disabled: tableData.page <= 1, onClick: () => { loadTableData(tableData.page - 1); render(); } }),
    el('button', { className: 'btn btn-sm', textContent: '下一页', disabled: tableData.page >= totalPages, onClick: () => { loadTableData(tableData.page + 1); render(); } }),
  ]);
}

function showSqlEditor() {
  const textarea = el('textarea', { className: 'sql-editor', id: 'sql-input', placeholder: 'SELECT * FROM table_name', rows: 8 });
  const resultDiv = el('div', { id: 'sql-result', className: 'sql-result' });
  const content = el('div', {}, [textarea, resultDiv]);
  showModal('执行 SQL', content, [
    el('button', { className: 'btn', textContent: '关闭', onClick: closeModals }),
    el('button', { className: 'btn btn-primary', textContent: '执行', onClick: executeSql }),
  ]);
}

async function executeSql() {
  const sqlText = $('#sql-input')?.value?.trim();
  if (!sqlText || !currentDb) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  const resultDiv = $('#sql-result');
  try {
    const upper = sqlText.toUpperCase().trim();
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA')) {
      const data = queryDb(db, sqlText);
      if (data.error) { resultDiv.textContent = '错误: ' + data.error; resultDiv.className = 'sql-result error'; return; }
      let html = `<p>${data.results.length} 行</p><table class="data-table"><thead><tr>`;
      for (const c of data.columns) html += `<th>${c}</th>`;
      html += '</tr></thead><tbody>';
      for (const row of data.results) {
        html += '<tr>';
        for (const c of data.columns) html += `<td>${row[c] === null ? '<span class="null-val">NULL</span>' : row[c]}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      resultDiv.innerHTML = html;
      resultDiv.className = 'sql-result';
    } else {
      db.run(sqlText);
      await saveDb(currentDb);
      resultDiv.textContent = '执行成功';
      resultDiv.className = 'sql-result';
      await refreshSidebar();
    }
  } catch (e) {
    resultDiv.textContent = '错误: ' + e.message;
    resultDiv.className = 'sql-result error';
  }
}

function showImportDialog() {
  const dbNameRow = el('div', { className: 'import-row' }, [
    el('label', { textContent: '目标数据库: ' }),
    el('input', { type: 'text', id: 'import-db-name', placeholder: '数据库名称(新建或已有)', className: 'input-sm', value: currentDb || '' }),
  ]);
  const typeRow = el('div', { className: 'import-options' }, [
    el('label', { className: 'import-label' }, [
      el('input', { type: 'radio', name: 'import-type', value: 'db', checked: true }), ' .db 文件',
    ]),
    el('label', { className: 'import-label' }, [
      el('input', { type: 'radio', name: 'import-type', value: 'csv' }), ' .csv 文件',
    ]),
  ]);
  const modeRow = el('div', { className: 'import-options' }, [
    el('label', { className: 'import-label' }, [
      el('input', { type: 'radio', name: 'import-mode', value: 'replace', checked: true }), ' 替换',
    ]),
    el('label', { className: 'import-label' }, [
      el('input', { type: 'radio', name: 'import-mode', value: 'merge' }), ' 增量合并',
    ]),
  ]);
  const fileRow = el('input', { type: 'file', id: 'import-file', accept: '.db,.csv,.sqlite', className: 'file-input' });
  const csvNameRow = el('div', { id: 'csv-table-name', style: { display: 'none' } }, [
    el('label', { textContent: 'CSV表名: ' }),
    el('input', { type: 'text', id: 'csv-table', placeholder: 'table_name', className: 'input-sm' }),
  ]);
  const statusDiv = el('div', { id: 'import-status' });
  const content = el('div', {}, [dbNameRow, typeRow, modeRow, fileRow, csvNameRow, statusDiv]);

  showModal('导入数据', content, [
    el('button', { className: 'btn', textContent: '取消', onClick: closeModals }),
    el('button', { className: 'btn btn-primary', textContent: '导入', onClick: doImport }),
  ]);

  document.querySelectorAll('input[name="import-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const csvOpts = $('#csv-table-name');
      if (csvOpts) csvOpts.style.display = r.value === 'csv' && r.checked ? 'block' : 'none';
    });
  });
}

async function doImport() {
  const fileInput = $('#import-file');
  const file = fileInput?.files?.[0];
  if (!file) { alert('请选择文件'); return; }

  const dbName = $('#import-db-name')?.value?.trim();
  if (!dbName) { alert('请输入数据库名称'); return; }

  const importType = document.querySelector('input[name="import-type"]:checked')?.value || 'db';
  const importMode = document.querySelector('input[name="import-mode"]:checked')?.value || 'replace';
  const statusDiv = $('#import-status');
  if (statusDiv) statusDiv.textContent = '导入中...';

  try {
    if (!currentDb || currentDb !== dbName) {
      currentDb = dbName;
      await loadDb(dbName);
    }

    if (importType === 'db') {
      const buffer = await file.arrayBuffer();
      const sql = await initSQL();
      if (!sql) { throw new Error('sql.js 未加载'); }
      const srcDb = new sql.Database(new Uint8Array(buffer));
      const targetDb = dbInstances[currentDb];

      if (importMode === 'merge') {
        const tables = queryDb(srcDb, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        for (const t of tables.results) {
          const tableName = t.name;
          const srcData = queryDb(srcDb, `SELECT * FROM "${tableName}"`);
          if (srcData.columns.length === 0) continue;
          const colList = srcData.columns.map(c => `"${c}"`).join(',');
          const ph = srcData.columns.map(() => '?').join(',');
          for (const row of srcData.results) {
            targetDb.run(`INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${ph})`, srcData.columns.map(c => row[c]));
          }
        }
      } else {
        const tables = queryDb(srcDb, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        for (const t of tables.results) {
          try { targetDb.run(`DROP TABLE IF EXISTS "${t.name}"`); } catch {}
          if (t.sql) targetDb.run(t.sql);
          const srcData = queryDb(srcDb, `SELECT * FROM "${t.name}"`);
          if (srcData.columns.length === 0) continue;
          const colList = srcData.columns.map(c => `"${c}"`).join(',');
          const ph = srcData.columns.map(() => '?').join(',');
          for (const row of srcData.results) {
            targetDb.run(`INSERT INTO "${t.name}" (${colList}) VALUES (${ph})`, srcData.columns.map(c => row[c]));
          }
        }
      }
      srcDb.close();
      await saveDb(currentDb);
    } else if (importType === 'csv') {
      const text = await file.text();
      const tableName = $('#csv-table')?.value?.trim() || file.name.replace(/\.csv$/i, '');
      const { columns, rows } = parseCSV(text);
      if (columns.length === 0) { throw new Error('CSV解析失败'); }
      const db = dbInstances[currentDb];
      if (importMode === 'replace') {
        try { db.run(`DROP TABLE IF EXISTS "${tableName}"`); } catch {}
      }
      const colDef = columns.map(c => `"${c}" TEXT`).join(', ');
      db.run(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDef})`);
      const colList = columns.map(c => `"${c}"`).join(',');
      const ph = columns.map(() => '?').join(',');
      for (const row of rows) {
        db.run(`INSERT INTO "${tableName}" (${colList}) VALUES (${ph})`, row);
      }
      await saveDb(currentDb);
      currentTable = tableName;
    }

    if (statusDiv) statusDiv.textContent = '导入成功!';
    loadTableData();
    closeModals();
    render();
    await refreshSidebar();
  } catch (e) {
    if (statusDiv) statusDiv.textContent = '导入失败: ' + e.message;
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };
  function parseLine(line) {
    const result = []; let current = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQ = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === ',') { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }
  const columns = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) rows.push(parseLine(lines[i]));
  }
  return { columns, rows };
}

document.addEventListener('paste', async (e) => {
  if (!currentDb || !currentTable) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return;
  const db = dbInstances[currentDb];
  if (!db) return;
  const rows = lines.map(l => l.split('\t'));
  const colList = tableData.columns.map(c => `"${c}"`).join(',');
  const ph = tableData.columns.map(() => '?').join(',');
  for (const row of rows) {
    const vals = tableData.columns.map((c, i) => row[i] !== undefined ? row[i] : null);
    db.run(`INSERT INTO "${currentTable}" (${colList}) VALUES (${ph})`, vals);
  }
  await saveDb(currentDb);
  loadTableData(tableData.page);
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && selectedRows.size > 0 && !editingCell) deleteSelected();
  if (e.ctrlKey && e.key === 'c' && selectedRows.size > 0 && !editingCell) copySelected();
});

async function init() {
  try {
    await IDB.init();
  } catch (e) {
    console.error('IDB init failed:', e);
  }
  render();
  await refreshSidebar();
}

init();
