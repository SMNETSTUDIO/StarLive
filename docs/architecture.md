# StarLive 星播平台 — 系统架构与功能规划

> 本文档为 StarLive 的架构与功能基线，作为开发与对齐依据。

---

## 1. 项目概述

StarLive 是一个**可自部署的独立后端直播互动平台**，业务上是一个带 **虚拟货币（星币，SC）经济系统** 的直播互动平台：观众可充值、送礼物、发弹幕、抢红包、参与抽奖；主播可通过礼物收益提现。

相比 LDLive（旧基线）的核心升级：

| 维度 | LDLive（旧） | StarLive（新） |
|---|---|---|
| 后端形态 | Netlify Functions（~90 个无状态函数） | 独立 Node 服务（NestJS）+ Socket.IO 长连接 |
| 实时互动 | HTTP 增量轮询 | WebSocket 全房广播（弹幕/礼物/红包/抽奖/在线数） |
| 直播推流 | Mux 托管 | 自建 MediaMTX/SRS + FFmpeg，Mux 作为可选 Provider |
| 录播/转码 | 始终可用（Mux Assets） | 后台开关，默认关闭，独立 Worker 执行 |
| 认证 | 仅 LinuxDO OAuth2 | 自建账号密码 + 可选 OAuth |
| 主数据库 | Upstash Redis | 自托管 Redis（可继续用 Upstash） |
| 虚拟货币 | LDC | 星币（StarCoin，SC） |
| 支付 | 仅 EPay/LPay | 多网关兼容（易支付/支付宝/微信/Stripe/mock） |
| 部署 | Netlify | Docker 镜像 + docker compose 一键部署 |

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | Node 20 + NestJS 10 + TypeScript |
| 实时通信 | Socket.IO 4（服务端）+ socket.io-client |
| 数据库 | Redis（ioredis；自托管或 Upstash） |
| 推流/分发 | MediaMTX（首选）/ SRS |
| 转码/录播 | FFmpeg（独立 Worker，可开关） |
| 视频服务抽象 | StreamProvider 接口（SelfHostedProvider / MuxProvider） |
| 前端 | React 18 + TS + Vite 5 + TailwindCSS + React Router |
| 播放器 | hls.js + 自定义弹幕层 |
| 国际化 | i18next（zh/en） |
| 认证 | JWT（jose，HS256）+ bcrypt 密码哈希 |
| 支付 | PaymentProvider 多网关适配器 |
| 构建 | pnpm workspaces（monorepo） |

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 (React SPA)                    │
│  登录/房间/充值/后台    弹幕·礼物·红包·抽奖·在线数 (Socket.IO) │
└───────────────┬─────────────────────────┬───────────────────┘
                │ REST /api/*             │ WebSocket (wss)
                ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 NestJS 后端服务 (apps/server)                 │
│  Auth │ Rooms │ Danmaku │ Gift │ Wallet │ RedPacket │ Lottery│
│  Recording │ Moderation │ Admin(RBAC) │ Payment │ Audit     │
│  ─────────────────────────────────────────────────────────── │
│  StreamProvider 抽象 ──► SelfHostedProvider / MuxProvider     │
│  RealtimeGateway (Socket.IO 房间网关 + 事件总线)              │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
   Redis       MediaMTX     Worker    支付网关    OAuth(可选)
  (主数据库)   (RTMP入/HLS出) (FFmpeg)  (易支付/支付宝/微信/Stripe)
```

**实时数据流**：REST 负责写操作 → 后端落库后通过 `RealtimeGateway` 向 `room:{id}` 房间广播事件；客户端 Socket.IO 订阅所在房间，接收 `danmaku` / `gift` / `redpacket` / `lottery` / `presence` 事件。REST 与 WS 共用同一 JWT 鉴权（握手时校验）。

---

## 4. 代码仓库结构（monorepo）

```
StarLive/
├── apps/
│   ├── server/                 # NestJS 后端
│   ├── web/                    # React 前端
│   └── worker/                 # 录播/转码 Worker
├── packages/
│   └── shared/                 # 共享 TS 类型/DTO/WS事件/Redis key/错误码
├── infra/
│   ├── docker-compose.yml
│   └── mediamtx.yml
└── docs/
```

---

## 5. 功能模块清单（对齐 LDLive）

1. **认证**：自建账号密码（bcrypt）+ 可选 OAuth + JWT（HttpOnly Cookie）、游客身份、封禁拦截。
2. **直播间**：创建/编辑/删除、公开/私密、密码房间、分类标签、公告、推流密钥、状态同步（idle/connected/active）。
3. **弹幕**：游客可发、敏感词过滤、频率限制、增量拉取、独立弹窗、WS 广播。
4. **礼物**：目录、打赏、余额扣减、主播收益、全房特效。
5. **经济系统**：星币充值（多网关）、提现（手续费 + 资金冻结）、交易流水。
6. **红包**：随机/均分、先到先得、24 小时过期。
7. **抽奖**：房主创建/开奖、观众参与、倒计时、历史。
8. **在线人数**：Socket.IO presence + Redis ZSET 心跳双轨、登录/游客拆分、TTL 过期。
9. **录播**：可开关、分享 token（免登录/限时/永久）。
10. **房管**：房管管理、房间禁言、操作日志、举报。
11. **管理后台**：RBAC、概览、用户/房间/提现/订单/权限/审计/内容治理/录播/系统设置。
12. **系统开关**：维护模式、功能开关（含录播/转码）、系统公告。

---

## 6. 实时通信协议（WebSocket）

命名空间 `/`，每个直播间对应 Socket.IO 房间 `room:{roomId}`。

| 方向 | 事件 | 说明 |
|---|---|---|
| C→S | `join_room` | 加入房间（含游客） |
| C→S | `leave_room` | 离开房间 |
| C→S | `heartbeat` | 在线心跳 |
| S→C | `danmaku` | 弹幕广播 |
| S→C | `gift` | 礼物打赏（触发特效） |
| S→C | `redpacket.created` / `redpacket.claimed` | 红包事件 |
| S→C | `lottery.started` / `lottery.joined` / `lottery.drawn` | 抽奖事件 |
| S→C | `presence` | 在线人数变更 |
| S→C | `room.status` | 开播/下播状态 |
| S→C | `mute` | 禁言通知 |

---

## 7. 直播推流/转码/录播链路

```
OBS ──RTMP──► MediaMTX(:1935/{streamKey})
                ├─► HLS (fMP4) ──► 前端 hls.js 播放
                ├─► WebRTC(可选) ──► 超低延迟
                └─► Worker(FFmpeg) ──► 转码/落盘录制 ──► 对象存储
```

- 创建房间时后端通过 MediaMTX Auth hook/API 动态注册 `streamKey` 路径
- 推流开始/结束通过 MediaMTX 回调更新房间状态并广播
- 录播/转码由 `apps/worker` 消费 Redis 任务队列执行，由系统开关控制（默认关闭）

---

## 8. 数据模型（Redis Key 约定）

```
# 用户
user:{id}                        # Hash
users:set                        # Set
user:balance:{id}                # Hash: coins/total_recharged/total_withdrawn/frozen_coins
user:transaction:{id}:{txId}     # Hash + ZSet 索引
user:distribute:{id}             # 提现收款配置
user:withdrawals:{id}            # ZSet
user:orders:{id}                 # ZSet

# 房间
room:{roomId}                    # Hash（含 stream_key/playback_id/status/provider）
rooms:set / publicRooms:set / userRooms:{uid} / category:{cat}
room:{id}:moderators             # Set
room:{id}:viewers / :viewers:u / :viewers:g   # ZSet 心跳
room:{id}:muted:{uid} / moderation:log

# 弹幕/礼物/抽奖/红包/支付
danmaku:z:{roomId} / danmaku:{roomId}:lastUpdate
gift:def:{id} / gifts:active / reward:record:{id} / room:rewards:{roomId}
lottery:{id} / lottery:{id}:participants / room:{id}:active_lottery / lotteries
redpacket:{id} / redpacket:claims:{id} / room:redpackets:{roomId}
payment:order:{orderId} / payment:out_trade_no:{no} / withdrawal:request:{id}

# 录播/系统/管理/锁/队列
recording:{id} / recording:share:{token} / recording:share:list:{roomId}
system:config / system:features / admin:user_roles / admin:roles
admin:sensitive_words / admin:audit:log
queue:recording / queue:transcode
lock:*
```

---

## 9. 支付网关（多网关兼容）

```ts
interface PaymentProvider {
  createOrder(order): Promise<PayResult>
  verifyCallback(req): Promise<VerifiedPayment>
  queryOrder(orderId): Promise<OrderStatus>
  refund(orderId): Promise<void>
}
```

| 适配器 | 说明 |
|---|---|
| `epay` | 彩虹易支付/通用易支付（MD5 签名） |
| `alipay` | 支付宝 |
| `wechat` | 微信支付 |
| `stripe` | Stripe（可扩展 PayPal） |
| `mock` | 沙箱联调 |

- 网关密钥存 `payment:config:{provider}`，启用状态与默认网关存 `system:config`
- 回调统一 `/api/payment/callback/:provider`，各自验签后进入同一套「幂等入账 + 分布式锁」流程

---

## 10. 系统开关（system:features）

| 开关 | 默认 | 说明 |
|---|---|---|
| `maintenanceEnabled` | false | 维护模式 |
| `recordingEnabled` | **false** | 录播（关闭则不给直播投递录制任务） |
| `transcodingEnabled` | **false** | 转码（关闭则透传源流） |
| `lotteryEnabled` | true | 抽奖开关 |
| `publicListEnabled` | true | 直播广场开关 |

---

## 11. 环境变量（.env.example）

见仓库根目录 `.env.example`。

---

## 12. 部署

- 一键启动：`docker compose up -d`
- 录播 Worker：`docker compose --profile recording up -d`
- 对外仅暴露 `web(80/443)`，`/api`、`/ws`、HLS 经 nginx 代理
- 环境变量通过 `.env` 注入，凭据不提交仓库

---

## 13. 分阶段实施

| 阶段 | 内容 |
|---|---|
| P0 基建 | monorepo、NestJS 骨架、Redis/JWT/守卫、docker-compose、Web 骨架 |
| P1 认证+房间 | 自建账号+OAuth、房间 CRUD、MediaMTX、HLS 播放 |
| P2 实时互动 | Socket.IO、弹幕、在线人数、礼物+特效 |
| P3 经济系统 | 充值/提现/流水/冻结、红包、抽奖 |
| P4 治理+录播 | 房管/禁言/举报、录播+分享、Mux 可选 |
| P5 管理后台 | RBAC、各管理模块、系统设置 |
| P6 打磨 | i18n、缓存、压测、部署文档 |
