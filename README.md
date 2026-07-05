# bms-esa-api — ESA 边缘函数协议数据库 API

> 最后更新：2026-07-05

## 概述

利用阿里云 ESA（Edge Service Architecture）的边缘函数和 KV 存储，模拟在线 SQLite，为 UI 项目提供动态协议数据库功能。包含 Web 管理界面，支持在线导入 db/csv、表编辑、权限管理和 GitHub 同步。

## 架构

```
UI 项目 (bms-ui)
  │
  ▼ fetch /api/data?search={version}
ESA 边缘函数
  │
  ├── KV: PROTOCOL_KV  ← 协议数据存储
  ├── KV: AUTH_KV      ← 用户/会话存储
  │
  ├── /api/data        → 公共 API（兼容旧接口）
  ├── /api/versions    → 版本列表
  ├── /api/admin/*     → 管理 API（需认证）
  └── /admin/*         → Web 管理界面 SPA
```

## 部署

### 1. 创建 KV 命名空间

在 ESA 控制台创建两个 KV 命名空间：
- `PROTOCOL_KV` — 存储协议数据
- `AUTH_KV` — 存储用户和会话

### 2. 配置 wrangler.toml

```toml
[[kv_namespaces]]
binding = "PROTOCOL_KV"
id = "你的-KV-ID"

[[kv_namespaces]]
binding = "AUTH_KV"
id = "你的-KV-ID"

[vars]
GITHUB_TOKEN = "你的GitHub Token"
GITHUB_REPO = "pengnanyu/protocol-db"
GITHUB_BRANCH = "main"
JWT_SECRET = "随机密钥"
```

### 3. 部署

```bash
npm install
npx wrangler deploy
```

## API 接口

### 公共 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data?search={version}` | 查询协议数据（兼容旧接口） |
| GET | `/api/versions` | 获取所有版本列表 |

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
esa-api/
├── src/
│   ├── index.ts              # 入口路由
│   ├── types.ts              # 类型定义
│   ├── handlers/
│   │   ├── protocol.ts       # 公共协议 API
│   │   ├── admin.ts          # 管理 API
│   │   └── admin-page.ts     # 管理 Web 界面
│   └── lib/
│       ├── kv.ts             # KV 存储操作
│       ├── auth.ts           # 认证（SHA-256 + Session）
│       ├── csv.ts            # CSV 解析/导出
│       └── github.ts         # GitHub 同步
├── wrangler.toml             # 部署配置
├── package.json
└── tsconfig.json
```
