# bms-sqlite — ESA 边缘函数协议数据库 API

> 最后更新：2026-07-06

## 概述

利用阿里云 ESA "边缘计算和 AI" 中的"函数和 Pages"功能，结合 KV 存储，模拟在线 SQLite，为 UI 项目提供动态协议数据库 API 和 Web 管理界面。

ESA 绑定 GitHub 仓库自动构建部署，代码推送后自动生效。

## 架构

```
UI 项目 (bms-ui / bms-android)
  │
  ▼ fetch /api/data?search={version}
ESA 边缘函数 (GitHub 自动构建)
  │
  ├── KV: PROTOCOL_KV  ← 协议数据存储
  ├── KV: AUTH_KV      ← 用户/会话存储
  │
  ├── /api/data        → 公共 API（兼容旧接口）
  ├── /api/versions    → 版本列表
  ├── /api/admin/*     → 管理 API（需认证）
  └── /admin/*         → Web 管理界面 SPA
```

## 部署方式

### ESA GitHub 自动构建（推荐）

1. 在 ESA 控制台 "函数和 Pages" 中创建项目
2. 绑定 GitHub 仓库 `pengnanyu/sqlite`
3. ESA 自动读取 `esa.jsonc` 配置，执行 `npm install && npm run build`
4. 构建产物 `dist/index.js` 部署为边缘函数
5. 在 ESA 控制台配置 KV 命名空间：
   - `PROTOCOL_KV` (namespace: `bms-protocol-db`)
   - `AUTH_KV` (namespace: `bms-auth`)
6. 在 ESA 控制台设置环境变量：
   - `GITHUB_TOKEN` — GitHub API Token（用于协议数据同步）
   - `JWT_SECRET` — JWT 签名密钥

### 本地开发

```bash
npm install
npm run build    # esbuild 打包到 dist/index.js
npm run dev      # wrangler 本地调试
```

## 配置文件说明

### esa.jsonc

ESA 自动构建配置文件，定义构建命令、输出路径和 KV 绑定。

### wrangler.toml

Cloudflare Wrangler 兼容配置，用于本地开发和 `wrangler deploy`。

### 构建命令

```bash
esbuild src/index.ts --bundle --outfile=dist/index.js --format=esm --platform=neutral --target=es2022
```

- `--format=esm` — 边缘函数要求 ESM 格式
- `--platform=neutral` — 中立平台，不注入 Node.js 或浏览器特定 polyfill
- 输出为单一 `dist/index.js` 文件

## API 接口

### 公共 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data?search={version}` | 查询协议数据（兼容旧接口） |
| GET | `/api/versions` | 获取所有版本列表 |
| GET | `/` 或 `/health` | 健康检查 |

### 管理 API（需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 登录 |
| POST | `/api/admin/logout` | 退出 |
| GET | `/api/admin/session` | 检查会话 |
| GET | `/api/admin/protocols` | 协议列表 |
| GET | `/api/admin/protocols/{version}` | 获取协议 |
| POST | `/api/admin/protocols/{version}` | 创建协议 |
| PUT | `/api/admin/protocols/{version}` | 更新协议 |
| DELETE | `/api/admin/protocols/{version}` | 删除协议 |
| POST | `/api/admin/protocols/import` | 导入 JSON/CSV |
| GET | `/api/admin/protocols/export` | 导出 |
| POST | `/api/admin/protocols/sync-github` | GitHub 同步 |
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 创建用户 |
| DELETE | `/api/admin/users/{id}` | 删除用户 |

## Web 管理界面

访问 `/admin` 进入管理界面。

### 功能
- 登录/退出
- 协议版本列表
- 表格在线编辑（双击单元格编辑）
- 右键菜单：插入行、复制、粘贴、删除
- 多行选择（复选框或 Ctrl+C/V/Delete）
- 导入 JSON/CSV 文件
- 导出 JSON/CSV
- GitHub 双向同步
- 用户管理（管理员）

### 权限

| 角色 | 权限 |
|------|------|
| admin | 全部操作（增删改、用户管理、GitHub 同步） |
| editor | 编辑协议数据、导入导出 |
| viewer | 只读 |

### 默认用户

首次部署自动创建：
- 用户名：`admin`
- 密码：`admin123`

**请在首次登录后立即修改密码或创建新用户并删除默认用户。**

## GitHub 同步

同步将所有协议数据以 JSON 文件格式推送到 GitHub 仓库：
- `protocols/{version}.json` — 每个版本单独文件
- `protocols/index.json` — 版本索引
- `protocols/all.json` — 完整导出

支持双向同步：
- **推送**：KV → GitHub
- **拉取**：GitHub → KV

## 目录结构

```
sqlite/
├── src/
│   ├── index.ts              # 入口路由
│   ├── types.ts              # 类型定义
│   ├── handlers/
│   │   ├── admin.ts          # 管理 API + 公共协议 API
│   │   └── admin-page.ts     # 管理 Web 界面（内嵌 HTML）
│   └── lib/
│       ├── kv.ts             # KV 存储操作
│       ├── auth.ts           # 认证（SHA-256 + Session）
│       ├── csv.ts            # CSV 解析/导出
│       └── github.ts         # GitHub 同步
├── esa.jsonc                 # ESA 自动构建配置
├── wrangler.toml             # Wrangler 部署配置
├── package.json
├── tsconfig.json
└── .gitignore
```
