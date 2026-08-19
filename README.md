# StarLive 星播平台

[![CI](https://github.com/SMNETSTUDIO/StarLive/actions/workflows/ci.yml/badge.svg)](https://github.com/SMNETSTUDIO/StarLive/actions/workflows/ci.yml)
[![Docker](https://github.com/SMNETSTUDIO/StarLive/actions/workflows/docker.yml/badge.svg)](https://github.com/SMNETSTUDIO/StarLive/actions/workflows/docker.yml)

可自部署的直播互动平台，带 **星币（StarCoin）虚拟货币经济系统**：观众可充值、送礼物、发弹幕、抢红包、参与抽奖；主播可通过礼物收益提现。

> 项目为 LDLive 旧版（Netlify Serverless）的重构升级版，从「无状态函数 + HTTP 轮询」迁移为「独立 NestJS 后端 + Socket.IO 实时长连接」。

## ✨ 核心能力

- **直播**：MediaMTX 自托管推流/播放（RTMP 入 + HLS 出），Mux 作为可选 Provider
- **实时互动**：Socket.IO 全房广播 —— 弹幕、礼物特效、红包、抽奖、在线人数
- **经济系统**：星币充值（多支付网关）、提现（手续费 + 资金冻结）、交易流水
- **互动玩法**：弹幕、礼物、红包（随机/均分）、抽奖、在线心跳
- **治理**：房间管理面板（任命房管/禁言/操作日志）、被禁言实时反馈、敏感词过滤（即时生效）、举报、管理员审计日志
- **社交**：关注主播、公开用户主页（`/user/:id`，粉丝数 + 直播间列表）
- **界面**：深色/浅色主题切换、骨架屏加载、移动端自适应、管理后台分页
- **安全**：登录/注册/下单速率限制、私密房间 WS 层密码校验
- **管理后台**：数据概览（统计卡 + 14 天趋势图）、用户管理（编辑资料/重置密码/余额调整/角色分配/流水查看）、房间管理（编辑/封禁）、提现审批、订单管理（筛选/手动补单/CSV 导出）、RBAC、审计日志、内容治理、系统设置
- **开箱即用**：前后端一体化单端口部署，首次访问网页向导创建管理员，无需预配置账号
- **录播**：独立 Worker（FFmpeg）转码/落盘，默认关闭，可开关

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node 20 · NestJS 10 · TypeScript |
| 实时通信 | Socket.IO 4 |
| 数据库 | Redis（ioredis，自托管或 Upstash） |
| 推流/分发 | MediaMTX（首选）/ SRS |
| 转码/录播 | FFmpeg（独立 Worker，可开关） |
| 前端 | React 18 · Vite 5 · TailwindCSS · React Router · hls.js |
| 认证 | JWT（jose，HS256）+ bcrypt 密码哈希 |
| 支付 | PaymentProvider 多网关适配器（易支付/支付宝/微信 APIv3 Native/Stripe/mock） |
| 构建 | pnpm workspaces（monorepo） |

## 📦 仓库结构

```
StarLive/
├── apps/
│   ├── server/     # NestJS 后端（REST + Socket.IO 网关）
│   ├── web/        # React 前端
│   └── worker/     # 录播/转码 Worker（FFmpeg）
├── packages/
│   └── shared/     # 共享 TS 类型 / DTO / WS 事件 / Redis key / 错误码
├── infra/
│   ├── docker-compose.yml
│   └── mediamtx.yml
└── docs/
    └── architecture.md   # 系统架构与功能规划
```

## 🚀 快速开始

### 方式一：Docker 一键部署

```bash
# 准备环境变量
cp .env.example .env

# 基本启动（server + web + redis + mediamtx）
docker compose up -d

# 开启录播 Worker（FFmpeg）
docker compose --profile recording up -d
```

也可直接使用 GHCR 预构建镜像：

```bash
docker run -d -p 3000:3000 \
  -e REDIS_URL=rediss://default:TOKEN@xxx.upstash.io:6379 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  ghcr.io/smnetstudio/starlive:main
```

前后端一体化，对外只暴露 **3000 端口**（网页 + `/api` + `/socket.io` + `/hls` 同源）；Redis 数据持久化在卷 `redis-data`，录播落盘在卷 `recordings-data`。首次访问 `http://<host>:3000` 会进入初始化向导创建管理员。

### 方式二：本地运行（前后端一体化，单端口 3000）

```bash
pnpm install
pnpm build        # 构建前端 + 后端
pnpm start        # 一体化服务：http://localhost:3000（网页 + /api + /socket.io + /hls）
```

首次部署打开 `http://localhost:3000`，网页会自动进入**初始化向导**，引导创建超级管理员账号密码（写入 Redis），之后即可用该账号登录管理后台 `/admin`。

开发调试（可选，前端热更新）：

```bash
pnpm dev:server   # NestJS 后端（:3000）
pnpm dev:web      # Vite 前端（:5173，/api 代理到 :3000）
pnpm dev:worker   # 录播 Worker
```

需要本地 Redis（或改 `REDIS_URL` 指向 Upstash）与 MediaMTX（或用 `docker compose up -d redis mediamtx` 单独起依赖）。

## 🔑 配置

**环境变量只需两个必填项**（见根目录 `.env.example`）：

- `REDIS_URL` — Redis 连接串（自托管 `redis://:password@localhost:6379`，Upstash 用 `rediss://` TLS）
- `JWT_SECRET` — JWT 签名密钥（`openssl rand -hex 32` 生成）

部署拓扑相关的基础设施变量（`PORT`/`HOST`、`MEDIAMTX_*`、`FFMPEG_PATH`、Cookie 策略等）有合理默认值，按部署方式调整。

**其余业务配置在管理后台设置**（`/admin` → 系统设置，存 Redis、即时生效、优先于环境变量）：

- 站点对外地址（支付回调 / HLS 播放地址的生成基准）
- OAuth 第三方登录（提供方名称、Client ID/Secret、授权/令牌/用户信息地址）
- 支付网关（易支付 / 支付宝 / 微信 APIv3 / Stripe，密钥掩码回显，可独立启停）
- 功能开关（维护模式、注册、录播、抽奖等）、经济参数、系统公告

同名环境变量仍作为「后台未设置时的兜底值」被读取，适合偏好 CI/IaC 管密钥的场景；凭据不提交仓库。

## 🎬 直播链路

```
OBS ──RTMP──► MediaMTX(:1935/{streamKey})
                ├─► HLS (fMP4) ──► 前端 hls.js 播放
                ├─► WebRTC(可选) ──► 超低延迟
                └─► Worker(FFmpeg) ──► 转码/落盘录制 ──► 对象存储
```

## 📡 实时协议

REST 负责写操作，后端落库后经 `RealtimeGateway` 向 `room:{roomId}` 广播事件（`danmaku` / `gift` / `redpacket.*` / `lottery.*` / `presence` / `room.status` / `mute`）。客户端 Socket.IO 订阅所在房间，REST 与 WS 共用同一 JWT 鉴权。

## 🗂️ 文档

- [系统架构与功能规划](docs/architecture.md) — 模块清单、Redis Key 约定、支付网关抽象、分阶段实施

## License

Private repository — 版权所有，未经授权请勿分发。
