# 构建上下文 = 仓库根目录
FROM node:20-alpine

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

RUN pnpm --filter @starlive/shared build
RUN pnpm --filter @starlive/server build

ENV NODE_ENV=production

WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "dist/main.js"]
