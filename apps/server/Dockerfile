# 构建上下文 = 仓库根目录（前后端一体化：server 同时托管 web 构建产物）
FROM node:22-alpine

RUN npm install -g pnpm@11.17.0

WORKDIR /app

# 先拷贝清单以利用依赖缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

RUN pnpm --filter @starlive/shared build
RUN pnpm --filter @starlive/server build
RUN pnpm --filter @starlive/web build

ENV NODE_ENV=production

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
