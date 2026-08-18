# LDLive 系统介绍与功能说明

> 本文档用于记录 LDLive 现有系统的完整功能与架构，作为新项目重构的功能对齐基线（Feature Baseline）。

---

## 1. 项目概述

LDLive 是一个可部署到 Netlify 的直播平台，核心能力包括：

- **登录**：LinuxDO OAuth2（由 Netlify Functions 实现）
- **直播**：Mux Live Streams（创建直播流、推流、播放）
- **存储**：Upstash Redis（REST API，作为主数据库）
- **前端**：React 18 + Vite + TailwindCSS + React Router
- **后端**：Netlify Functions（Node 18，无独立服务器，Serverless）

业务上是一个带 **虚拟货币（LDC）经济系统** 的直播互动平台：观众可充值、送礼物、发弹幕、抢红包、参与抽奖；主播可通过礼物收益提现。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript + Vite 5 |
| 路由 | react-router-dom 6（路由级懒加载） |
| 样式 | TailwindCSS 3 + 自定义设计系统（Apple 风格液态玻璃 UI） |
| 国际化 | i18next + react-i18next（中文 zh / 英文 en） |
| 播放器 | DPlayer + hls.js（HLS 低延迟直播） |
| 图标 | @heroicons/react |
| 后端 | Netlify Functions（`netlify/functions`） |
| 数据库 | Upstash Redis（REST API + Pipeline） |
| 认证 | JWT（jose 库，HS256） |
| 直播 | Mux Video API |
| 支付 | EPay（充值，MD5 签名）、LPay（提现分发） |

---

## 3. 系统架构

```
浏览器 (React SPA)
   │  fetch('/api/*')
   ▼
Netlify Functions (约 90 个无状态函数)
   │
   ├── Upstash Redis (数据持久化, REST API)
   ├── Mux Video API (直播流 / 录播资产)
   ├── LinuxDO OAuth2 (身份认证)
   ├── EPay (充值支付网关)
   └── LPay (提现分发网关)
```

- **无独立后端服务器**，所有 API 都是 Netlify Functions，按业务拆分为一个函数一个文件。
- **认证**：登录成功后签发 JWT，写入 `session` Cookie（HttpOnly，7 天有效）；游客通过 `viewer_session` Cookie 识别。
- **数据层**：`netlify/functions/utils.ts` 提供 Redis 封装（`redis()` / `redisPipeline()` 批量执行）、JWT 签发/校验、权限校验、内存缓存等公共能力。
- **鉴权**：`requireUser()` 校验登录态；`requireAdmin()` 校验管理员 + 权限点；`requireSuperAdmin()` 校验超级管理员。

---

## 4. 核心功能模块

### 4.1 用户与认证

- **OAuth 登录**：`/api/oauth-initiate` 跳转 LinuxDO 授权；`/api/oauth-callback` 回调换取 token、拉取用户信息、签发 JWT、写入 `session` Cookie、写入 Redis 用户档案。
- **当前用户**：`/api/me` 返回登录用户信息（含 `admin` / `isSuperAdmin` / `roleId` / `permissions`）。前端 `fetchMe()` 做 in-flight 去重 + 1.5 秒微缓存。
- **登出**：`/api/logout` 清除 Cookie。
- **游客身份**：未登录用户在本地生成稳定 `guest_id`（localStorage），用于发弹幕等场景。
- **封禁**：用户被封禁后，`/api/me` 返回 403，前端跳转 `/banned` 页面。

### 4.2 直播间（核心）

**创建房间**（`/api/rooms-create`）：
- 输入标题、自定义房间号（可选，slug 化）、公告、公开/私密、房间密码（可选，SHA-256 哈希存储）、分类、标签。
- 调用 Mux 创建 Live Stream，获得 `stream_key`（推流密钥）、`playback_id`（播放 ID）。
- 房间数据存入 Redis Hash `room:{roomId}`，并维护索引集合 `rooms:set`、`publicRooms:set`、`userRooms:{userId}`。

**房间属性**：
- `title` 标题、`announcement` 公告、`ownerId` 房主、`isPublic` 公开/私密、`passwordHash` 密码、`category` 分类、`tags` 标签、`status` 状态（idle/active/connected）、`mux_live_stream_id`、`mux_stream_key`、`mux_playback_id`、`banned` 封禁。

**房间访问**（`/api/room-get`）：
- 密码房间：非房主/管理员需验证密码，前端弹密码框，正确后缓存于 sessionStorage。
- 被封禁房间返回 403 + `room_banned`。
- 房主可获得推流密钥（`mux_stream_key`），用于 OBS 等推流工具。
- 实时查询 Mux 直播流状态（带 5 秒内存缓存 + 3 秒超时降级）。

**房间列表**（`/api/rooms-list`）：
- `mine=true`：我的房间（含推流凭证）。
- `public=true`：公开房间（含在线人数），带 CDN 缓存。
- `category=`：按分类筛选。

**房间操作**：
- 编辑标题/公开状态：`/api/room-update`、`/api/room-tags-update`（分类标签）。
- 编辑公告：`/api/room-announcement-update`。
- 删除房间：`/api/room-delete`。
- 管理员编辑/删除/封禁：`/api/admin-room-update`、`/api/admin-room-delete`、`/api/admin-room-ban`。

**在线人数**：
- 心跳机制 `/api/room-heartbeat`：观众每 10~15 秒上报一次，服务端 20 秒 TTL 过期。
- 在线集合按登录用户（`room:{id}:viewers:u`）与游客（`room:{id}:viewers:g`）拆分，用 ZSET 记录心跳时间。
- 返回 `viewerCount` / `registeredCount` / `guestCount`。

**直播广场**（`/live-list`）：
- 展示所有公开且开播的房间，支持分类筛选、在线人数、热度标记（≥10 人）、20 秒自动刷新。

### 4.3 弹幕 / 聊天

- **发送**：`/api/danmaku-send`（支持登录用户与游客）。
  - 敏感词过滤（内存缓存 60 秒，词库在 Redis `admin:sensitive_words`）。
  - 频率限制（同一身份 5 秒最多 8 条）。
  - 校验房间封禁、用户封禁、全局禁言、房间禁言（返回不同 code：`muted` / `room_muted` / `room_banned` / `banned`）。
  - 单条最长 30 字符。
- **拉取**：`/api/danmaku-list`（支持增量 `since` 拉取、10 分钟窗口、每房间保留 150 条）。
- **弹幕渲染**：前端自定义弹幕层覆盖在播放器上（头像 + 彩色文字滚动动画）。
- **弹幕独立窗口**：`/room/:roomId/danmaku-popout`（弹幕弹窗页）。

### 4.4 礼物打赏

- **礼物目录**：`/api/gifts-list`，默认 5 种礼物（小心心/玫瑰花/跑车/火箭/皇冠），Redis 中 `gift:def:{id}`，首次访问播种。
- **送礼物**：`/api/gift-send`
  - 校验余额，单次 1~100 个。
  - 扣除发送者 LDC，增加主播（`to_user_id`，即房主）LDC。
  - 写入打赏记录、双方交易流水，通过弹幕流广播 `gift` 事件，全房同步播放礼物特效。
- **礼物特效**：前端根据聊天流中的 `gift` 消息触发全房同步特效动画。

### 4.5 虚拟货币（LDC）与经济系统

**余额**：`/api/balance-get` 返回 `ldc`、`total_recharged`（累计充值）、`total_withdrawn`（累计提现）。存于 `user:balance:{userId}` Hash。

**交易流水**：`/api/balance-transactions`，类型包括 `recharge`（充值）、`gift_send`（送礼物）、`gift_receive`（收礼物）、`redpacket_send`（发红包）、`redpacket_receive`（抢红包）、`withdrawal`（提现）。

**充值**（`/recharge` 页面）：
- `/api/payment-create-order` 创建订单（`payment:order:{orderId}`）。
- 接入 **EPay 支付网关**（MD5 签名，`payment-utils.ts`），生成表单提交。
- `/api/payment-callback` 处理支付回调：验签 → 校验金额 → 幂等入账（分布式锁 + 订单号去重）。
- 订单状态：`pending` / `paid` / `failed` / `refunded`。
- 1 LDC 充值 = 1 LDC 到账（比例 `gift_ldc_ratio` 可配置）。

**提现**（`/withdrawal` 页面）：
- 配置收款账户（`user:distribute:{userId}`，收款人用户 ID + 用户名）。
- `/api/withdrawal-request` 创建提现申请：冻结资金（`frozen_ldc`），最低 10 LDC，收取 20% 手续费。
- 管理员审核：`/api/admin-withdrawal-process` 通过/拒绝；通过后调用 **LPay 分发接口**（`callDistributeApi`）自动划转。
- 状态流转：`pending → processing → completed/rejected`。
- 拒绝时解冻资金。

**红包**：
- 创建：`/api/redpacket-create`（随机/均分两种模式，1~100 个，24 小时过期）。
- 领取：`/api/redpacket-claim`（先到先得，仅登录用户）。
- 列表：`/api/redpacket-list`（前端 6 秒轮询）。

**抽奖**：
- 创建：`/api/lottery-create`（仅房主，中奖 1~100 人，倒计时 10 秒~1 小时）。
- 参与：`/api/lottery-join`。
- 开奖：`/api/lottery-draw`（房主手动开奖）。
- 查询/历史：`/api/lottery-get`、`/api/lottery-history`。
- 前端对活跃抽奖 3 秒轮询、空闲 8 秒退避轮询。

### 4.6 录播与分享

- **录播列表**：`/api/room-recordings`，调用 Mux Assets API 拉取该直播流的历史录制资产（`room:{id}` → `mux_live_stream_id` → assets）。
- **下载**：`/api/recording-download`。
- **分享链接**：`/api/recording-share-create`（房主/房管/管理员可生成，token 存 Redis，默认 7 天，可永久）。
- **分享查看**：`/api/recording-share-info`、`/api/recording-share-list`、`/api/recording-share-revoke`。
- 访客通过 `?share={token}` 免登录查看录播。

### 4.7 房管与内容治理

**房管（Moderator）**：
- 房主可添加/移除房管：`/api/room-moderators-manage`。
- 房管列表：`/api/room-moderators-list`。
- 房管拥有部分管理权限（如查看录播、禁言用户）。

**禁言**：
- 房间内禁言：`/api/room-user-mute`（房主/房管，可选时长）。
- 禁言列表：`/api/room-muted-users`。
- 操作日志：`/api/room-moderation-log`。

**举报**：
- 观众举报弹幕：`/api/report-create`。
- 管理员处理举报：`/api/admin-reports-list`、`/api/admin-report-process`。

---

## 5. 管理后台

管理后台路由 `/admin`，使用独立 `AdminLayout`（桌面侧栏 + 移动抽屉）。

### 5.1 权限体系（RBAC）

- **角色**：`super_admin`（超级管理员，拥有全部权限）、`admin`（普通管理员，权限可配置）。
- **权限点**（`DEFAULT_ADMIN_PERMISSIONS`，见 `utils.ts`）：`system.*`、`users.*`、`stats.read`、`delivery.usage.read`、`rooms.*`、`moderation.*`、`recordings.*`、`audit.read` 等，支持通配符（如 `rooms.*`）。
- **超级管理员来源**：环境变量 `ADMIN_USER_IDS` 中的用户，或 Redis `admin:user_roles` 中角色为 `super_admin` 的用户。
- **权限接口**：`/api/admin-roles-get`、`/api/admin-roles-update`、`/api/admin-user-role-set`。

### 5.2 管理模块

| 模块 | 路径 | 功能 |
|---|---|---|
| 概览 | `/admin` | 用户数、房间数、公开房间数、投递用量（`admin-stats`、`admin-delivery-usage`） |
| 用户管理 | `/admin/users` | 用户列表、封禁/解封、禁言/解禁、设置角色 |
| 房间管理 | `/admin/rooms` | 房间列表、编辑、删除、封禁、批量删除、Mux 状态检查/恢复/清缓存 |
| 提现管理 | `/admin/withdrawals` | 待处理/已处理/已拒绝提现，审核通过或拒绝 |
| 订单管理 | `/admin/orders` | 支付订单列表 |
| 权限管理 | `/admin/rbac` | 角色权限查看、角色策略同步、分配管理员 |
| 操作日志 | `/admin/audit` | 管理员操作审计日志（`writeAdminAuditLog`） |
| 内容治理 | `/admin/moderation` | 敏感词管理、举报处理、弹幕查询/删除 |
| 录播分享管理 | `/admin/recordings` | 录播分享链接管理、撤销 |
| 系统设置 | `/admin/settings` | 系统公告、维护模式、功能开关 |

### 5.3 系统设置（功能开关）

`/api/system-features-get` 返回全站开关（`system:features` Hash）：
- `maintenanceEnabled` 维护模式（开启后普通用户跳转 `/maintenance`）
- `maintenanceMessage` 维护提示
- `lotteryEnabled` 抽奖开关
- `recordingsEnabled` 录播开关
- `publicListEnabled` 直播广场开关

系统公告：`/api/system-announcement-get`（弹窗展示，`SystemAnnouncementModal`），管理员可编辑。

---

## 6. 前端路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | App | 首页：未登录显示登录引导 + 特性介绍；已登录显示用户卡 + 创建直播间表单 |
| `/dashboard` | Dashboard | 我的房间管理（编辑/分享/删除） |
| `/live-list` | LiveList | 直播广场（公开直播列表） |
| `/room/:roomId` | Room | 直播间（播放器 + 聊天 + 礼物 + 抽奖 + 红包 + 房管） |
| `/room/:roomId/recordings` | Recordings | 房间录播列表 |
| `/room/:roomId/danmaku-popout` | DanmakuPopout | 弹幕独立弹窗 |
| `/recharge` | Recharge | 充值 |
| `/withdrawal` | Withdrawal | 提现 |
| `/banned` | Banned | 封禁提示 |
| `/maintenance` | Maintenance | 维护模式提示 |
| `/admin/*` | Admin 系列 | 管理后台 |
| `*` | NotFound | 404 |

---

## 7. 数据模型（Redis Key 约定）

```
# 用户
user:{id}                          # Hash: id/name/username/avatar_url/banned/muted
users:set                          # Set: 全部用户 ID
user:balance:{id}                  # Hash: ldc/total_recharged/total_withdrawn/frozen_ldc
user:transaction:{id}:{txId}       # Hash: 交易流水
user:transactions:index:{id}       # ZSet: 用户交易索引
user:distribute:{id}               # Hash: 提现收款配置
user:withdrawals:{id}              # ZSet: 用户提现索引
user:orders:{id}                   # ZSet: 用户订单索引
user:rewards:sent:{id} / received  # ZSet: 打赏索引

# 房间
room:{roomId}                      # Hash: 房间全部字段
rooms:set                          # Set: 全部房间
publicRooms:set                    # Set: 公开房间
userRooms:{userId}                 # Set: 用户房间
category:{category}                # Set: 分类房间
room:{id}:moderators               # Set: 房管
room:{id}:viewers / :viewers:u / :viewers:g   # ZSet: 在线观众（心跳）
room:{id}:muted:{userId}           # 房间禁言标记
room:{id}:moderation:log           # List: 房管操作日志

# 弹幕
danmaku:z:{roomId}                 # ZSet: 弹幕（按时间戳排序）
danmaku:{roomId}:lastUpdate        # 增量拉取游标

# 礼物
gift:def:{id}                      # Hash: 礼物定义
gifts:active                       # ZSet: 活跃礼物
reward:record:{id}                 # Hash: 打赏记录
room:rewards:{roomId}              # ZSet: 房间打赏索引

# 抽奖
lottery:{id}                       # Hash: 抽奖信息
lottery:{id}:participants          # Set/ZSet: 参与名单
room:{id}:active_lottery           # 当前活跃抽奖
room:{id}:lotteries                # List: 房间抽奖历史

# 红包
redpacket:{id}                     # Hash: 红包信息
redpacket:claims:{id}              # 领取记录
room:redpackets:{roomId}           # ZSet: 房间红包索引

# 支付 / 提现
payment:order:{orderId}            # Hash: 订单
payment:out_trade_no:{no}          # 商户订单号 → 订单 ID
payment:orders:by_status:{status}  # ZSet: 按状态索引
payment:config:epay                # Hash: 支付网关配置
withdrawal:request:{id}            # Hash: 提现申请
withdrawals:by_status:{status}     # ZSet: 按状态索引

# 录播分享
recording:share:{token}            # 分享 token
recording:share:list:{roomId}      # Set: 房间分享链接索引

# 系统 / 管理
system:config                      # Hash: 提现费率/最低提现等配置
system:features                    # Hash: 全站功能开关
admin:user_roles                   # Hash: 用户 → 角色
admin:roles                        # Hash: 角色 → 权限列表
admin:sensitive_words              # Set: 敏感词库
admin:audit:log                    # List: 管理员审计日志

# 锁
lock:*                             # 分布式锁（支付回调/提现/抽奖等防并发）
```

---

## 8. 环境变量

见 `.env.example`：

| 变量 | 说明 |
|---|---|
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Mux 视频 API 凭证（必填） |
| `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` | LinuxDO OAuth2 凭证（必填） |
| `OAUTH_REDIRECT_URI` | OAuth 回调地址 |
| `APP_BASE_URL` | 应用基础 URL |
| `JWT_SECRET` | JWT 签名密钥（必填） |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis 凭证（必填） |
| `ADMIN_USER_IDS` | 超级管理员 ID（逗号分隔） |
| `EPAY_PID` / `EPAY_KEY` / `EPAY_GATEWAY` 等 | EPay 充值网关配置 |
| `LPAY_CLIENT_ID` / `LPAY_CLIENT_SECRET` / `LPAY_GATEWAY` | LPay 提现分发配置 |
| `REDIS_DEBUG` | Redis 调试日志开关 |
| 各类 `*_TTL` / `*_LOCK` 配置 | 缓存/锁超时微调 |

---

## 9. 部署

- **构建**：`npm run build`（Vite）
- **发布目录**：`dist`
- **函数目录**：`netlify/functions`
- **本地开发**：`npm run dev`（`netlify dev`，端口 8888）
- 环境变量在 Netlify 仪表盘配置，不在仓库提交凭据。

---

## 10. 重构注意事项（功能对齐清单）

1. **认证**：LinuxDO OAuth2 + JWT（HttpOnly Cookie），游客身份，封禁拦截。
2. **直播间**：创建/编辑/删除、公开/私密、密码房间、分类标签、公告、推流密钥、Mux 状态同步。
3. **弹幕**：游客可发、敏感词过滤、频率限制、增量拉取、独立弹窗。
4. **礼物**：目录、打赏、余额扣减、主播收益、全房特效。
5. **经济系统**：LDC 充值（EPay）、提现（LPay + 手续费 + 资金冻结）、交易流水。
6. **红包**：随机/均分、先到先得、24 小时过期。
7. **抽奖**：房主创建/开奖、观众参与、倒计时、历史。
8. **在线人数**：心跳 + 登录/游客拆分 + TTL 过期。
9. **录播**：Mux Assets、分享 token（免登录/限时/永久）。
10. **房管**：房管管理、房间禁言、操作日志、举报。
11. **管理后台**：RBAC 权限体系（超级管理员/普通管理员/权限点）、用户/房间/提现/订单/权限/审计/内容治理/录播/系统设置。
12. **系统开关**：维护模式、功能开关、系统公告弹窗。
