# 校园体育器材报损系统 (Sports Equipment Damage Reporting System)

一套端到端的、前后端联动的校园体育器材全生命周期管理 Web 应用。覆盖器材台账维护 → 借用出库 → 归还确认 → 报损登记 → 维修报价 → 总务审批 → 维修/报废 → 库存回写 → 历史审计完整链路，内置业务规则引擎与幂等保护机制。

---

## ✨ 核心特性

### 👥 4 种角色（权限隔离）
| 角色 | 账号 | 密码 | 核心权限 |
|------|------|------|----------|
| 体育老师 | `teacher1` / `teacher2` | `123456` | 借用器材、登记报损、查看历史 |
| 器材管理员 | `admin1` / `admin2` | `123456` | 台账维护、归还确认、审批报损、库存调整 |
| 总务审批人 | `general1` | `123456` | **审批超限报价**、审批报废 |
| 维修报价录入人 | `quotation1` | `123456` | 录入维修报价、标记维修完成 |

### 🔒 6 条强制业务规则（不可绕过）
1. **借出未归还器材不能直接报废** — 审批报废时校验借用状态
2. **维修报价超限需总务审批** — 超阈值（默认 ¥1000）自动标记需总务审批
3. **同一器材未结报损不能重复报损** — 存在 PENDING_* / REPAIRING 状态时拒绝新报损
4. **审批通过前不减可用库存** — 仅在最终审批通过/维修完成时才扣减库存
5. **报废后器材不可再被借出** — 状态 SCRAPPED 的器材借用接口直接拒绝
6. **非审批人不能通过超限报价** — 报价录入人等非审批角色无法通过超限单

### 📦 完整数据模型
- **器材台账**：15 大类器材，含编号、分类、品牌、型号、位置、价格
- **库存位置**：记录存放位置 + 总库存/可用库存实时计算
- **借用归还**：借用人、日期、用途、预计/实际归还、状态流转
- **报损申请**：单号自动生成、损坏等级、幂等键防重、附件/照片上传
- **维修报价**：报价人、供应商、报价金额、超限标记、预计天数
- **报废审批**：审批人、审批时间、决策（维修/报废）、审批备注
- **库存变更流水**：每次借用/归还/报损/报废/调整均记录前后库存
- **审计日志**：全操作记录（谁、在何时、对什么、做了什么、从哪来）

---

## 🚀 快速启动

### 方式一：Docker 一键启动（推荐）

```bash
# 在项目根目录执行
docker-compose up -d --build
```

启动后访问：
- 🌐 应用主页: http://localhost:3000
- ❤️ 健康检查: http://localhost:3000/api/health
- 📚 API 文档: http://localhost:3000/api

首次启动会自动初始化种子数据（6 个用户 + 15 类器材 + 3 条借用记录 + 1 条待报价报损单）。

---

### 方式二：本地开发模式

#### 1. 安装依赖
```bash
# 后端依赖
cd backend && npm install && cd ..

# 前端依赖
cd frontend && npm install && cd ..
```

#### 2. 启动后端（端口 3000）
```bash
cd backend
npm run start
# 或开发模式（热重载）： npm run dev
```
后端启动时自动初始化种子数据。

#### 3. 启动前端（端口 5173，代理到 3000）
```bash
cd frontend
npm run dev
```
访问 http://localhost:5173

---

### 方式三：构建后生产模式

```bash
# 1. 构建前端
cd frontend && npm run build

# 2. 启动后端（会自动托管 frontend/dist）
cd ../backend && npm run start
```
访问 http://localhost:3000

---

## ✅ 端到端验收验证脚本

覆盖用户要求的 **3 个核心场景**，自动化验证。

### 启动验证
```bash
# 1. 先确保后端在 3000 端口运行
# 2. 执行验证脚本
cd backend
npm run test
# 或： node tests/verify.js

# 可自定义服务地址：
TEST_BASE_URL=http://localhost:3000 node tests/verify.js
```

### 🎯 覆盖的验证场景

#### 场景 1：借出未归还器材申请报废 → ✅ 失败
```
步骤：
  1. 新建器材 (TEST-S1) ×5 件
  2. 体育老师借用 2 件（故意不归还）
  3. 创建报损单（库存剩余 3 件）
  4. 录入 ¥1500 超限维修报价
  5. 总务审批时选择「报废」
预期：
  → ❌ 审批失败，提示"存在未归还的借用记录，不能直接报废"
  → ✅ 改为「维修」审批成功
```

#### 场景 2：超限报价进入总务审批 → ✅ 成功
```
步骤：
  1. 新建器材 (TEST-S2) ×2 件
  2. 体育老师报损 1 件
  3. 报价员录入超过阈值(¥1000)的报价 ¥1500
预期：
  → ✅ 报损单状态自动变为 PENDING_APPROVAL
  → ✅ needs_general_approval = 1（标记需总务审批）
  4. 报价员（非审批人）尝试审批
预期：
  → ❌ HTTP 403 权限不足
  5. 总务审批人审批通过 + 维修完成
预期：
  → ✅ 库存恢复为 NORMAL
```

#### 场景 3：重复提交同一报损单不会生成两条待办 → ✅ 幂等生效
```
步骤：
  1. 新建器材 (TEST-S3) ×10 件
  2. 第 1 次提交报损单（幂等键 = idem-s3-xxx）
预期：
  → ✅ 创建成功，ID = firstId
  3. 第 2 次提交（完全相同的幂等键）
预期：
  → ✅ 返回 idempotent=true，命中幂等，不创建新单
  4. 并发 3 次提交（模拟重复点击）
预期：
  → ✅ 全部命中幂等或返回同一 firstId
  5. 查询该器材未结报损单数量
预期：
  → ✅ 数量 = 1，ID 等于 firstId
  6. 换一个幂等键再次报损
预期：
  → ❌ 业务规则拦截"存在未结的报损单，不能重复报损"
  7. 验证可用库存始终 = 10（审批通过前不减）
预期：
  → ✅ 可用库存 = 10
```

### 📊 验证结果输出示例
```
╔══════════════════════════════════════════════════╗
║                  测试结果汇总                      ║
║  通过: 20  |  失败: 0  |  总计: 20  ║
║  通过率: 100.0%                                    ║
╚══════════════════════════════════════════════════╝
```

---

## 📁 项目结构

```
881/
├── backend/
│   ├── src/
│   │   ├── server.js              # 服务入口（含前端托管）
│   │   ├── database.js            # SQLite 建表与连接
│   │   ├── auth.js                # JWT 认证、角色、幂等、审计
│   │   ├── seed.js                # 种子数据脚本（6用户 + 15器材）
│   │   └── routes/
│   │       ├── auth.js            # 登录、个人信息
│   │       ├── health.js          # 健康检查
│   │       ├── equipment.js       # 器材台账 + 库存变更引擎
│   │       ├── borrow.js          # 借用归还流程
│   │       ├── damage.js          # 报损/报价/审批/维修完成（核心规则）
│   │       └── audit.js           # 审计日志、统计、库存变更查询
│   ├── tests/
│   │   └── verify.js              # ★ 端到端验证脚本（3场景）
│   ├── data/                      # SQLite 数据文件（自动生成）
│   ├── uploads/                   # 附件存储（自动生成）
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.js                # 入口
│   │   ├── App.vue
│   │   ├── style.css
│   │   ├── router/index.js        # 路由守卫
│   │   ├── stores/user.js         # 用户状态 Pinia
│   │   ├── utils/request.js       # Axios 拦截器（401/403 处理）
│   │   └── views/
│   │       ├── Login.vue          # 登录页（快捷登录按钮）
│   │       ├── Layout.vue         # 主布局（侧边栏+头像菜单）
│   │       ├── Dashboard.vue      # 工作台：统计卡/最近报损/待办/分类
│   │       ├── Equipment.vue      # 器材台账：增删改查/时间线/库存调整
│   │       ├── Borrow.vue         # 借用归还：登记/确认归还
│   │       ├── DamageReport.vue   # 报损管理：新建/报价/审批/时间线
│   │       ├── Approval.vue       # 审批中心：待办/已办列表
│   │       └── History.vue        # 历史查询：库存/借用/报损/审计4个页签
│   ├── index.html
│   ├── vite.config.js             # 代理 /api → localhost:3000
│   └── package.json
│
├── Dockerfile                     # 多阶段构建：后端+前端构建+运行
├── docker-compose.yml             # 一键编排（挂载数据卷）
└── README.md
```

---

## 🔌 API 速查

### 认证
| Method | URL | 说明 |
|--------|-----|------|
| POST | `/api/auth/login` | 登录获取 Token |
| GET  | `/api/auth/me` | 当前用户信息 |
| GET  | `/api/auth/users` | 用户列表 |

### 器材
| Method | URL | 说明 |
|--------|-----|------|
| GET/POST | `/api/equipments` | 列表/新增 |
| GET/PUT/DELETE | `/api/equipments/:id` | 查询/编辑/删除 |
| GET | `/api/equipments/:id/timeline` | 器材完整时间线 |
| POST | `/api/equipments/:id/adjust` | 手动调整库存 |

### 借用
| Method | URL | 说明 |
|--------|-----|------|
| GET/POST | `/api/borrows` | 借用列表/登记借用 |
| POST | `/api/borrows/:id/return` | 归还确认 |

### 报损（核心）
| Method | URL | 说明 |
|--------|-----|------|
| GET/POST | `/api/damage-reports` | 列表/**幂等性新建** |
| GET | `/api/damage-reports/:id` | 详情（含报价+附件） |
| GET | `/api/damage-reports/:id/timeline` | 单据时间线 |
| GET | `/api/damage-reports/threshold` | 报价阈值 |
| POST | `/api/damage-reports/:id/upload` | 附件上传 |
| POST | `/api/damage-reports/:id/quote` | **录入报价（超限自动标记总务审批）** |
| POST | `/api/damage-reports/:id/approve` | **审批（规则校验：未归还/权限/超限）** |
| POST | `/api/damage-reports/:id/complete-repair` | 维修完成 + 库存回写 |

### 审计
| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/audit/stats` | 全局统计（工作台用） |
| GET | `/api/audit/inventory-changes` | 库存变更流水 |
| GET | `/api/audit/logs` | 操作审计日志（需权限） |

---

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `JWT_SECRET` | sports-equipment-secret-key-2024 | JWT 签名密钥（生产务必修改） |
| `QUOTE_THRESHOLD` | 1000 | 维修报价阈值（元），超过需总务审批 |
| `NODE_ENV` | development | 运行环境 |

---

## 🔍 健康检查

### HTTP 检查
```bash
curl http://localhost:3000/api/health

# 预期返回:
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-06-10T08:00:00.000Z",
  "data": { "tables": 11, "users": 6, "equipments": 15 }
}
```

### 集成到监控
- **就绪探针**：`GET /api/health` → tables > 0 && users > 0
- **存活探针**：返回 200 OK 即可

---

## 📝 典型操作流程（手动验收路径）

使用账号 `admin1 / 123456`（管理员）体验完整链路：

1. **登录** → 工作台可看到 15 种器材、3 条借用中、1 条待处理报损
2. **器材台账** → 点击某器材「时间线」查看完整历史
3. **借用归还** → 新建篮球借用 → 返回列表看到借用中记录
4. **报损管理** → 新建报损（选羽毛球拍，损坏等级选「中度」）
5. 使用 `quotation1` 登录 → 录入 ¥2500 报价（超过阈值）
6. 使用 `general1` 登录 → 「审批中心」看到该待办 → 通过，决策选「维修」
7. 使用 `admin1` 登录 → 报损管理点击「维修完成」→ 查看库存已恢复
8. **历史查询** → 查看库存变更流水、审计日志、报损历史

---

## 🛡️ 安全性与合规

- 密码 bcrypt 加密存储（salt=10）
- JWT 认证 + 基于角色的访问控制（RBAC）
- 所有写操作记录审计日志（IP + UA + 新旧值）
- 文件上传限制 10MB，文件名随机化防路径遍历
- 库存操作数据库事务保证一致性
- 幂等键机制防重复提交（覆盖重复点击/网络重试）

---

## 🗃️ 重置数据

如需重新初始化：
```bash
# 删除 SQLite 数据库
rm -f backend/data/equipment.db backend/data/equipment.db-shm backend/data/equipment.db-wal

# 重启后端（会自动创建+种子初始化）
```
