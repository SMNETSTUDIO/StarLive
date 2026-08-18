# 构建上下文 = 仓库根目录
FROM node:20-alpine

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile

COPY apps/worker apps/worker

RUN pnpm --filter @starlive/worker build

ENV NODE_ENV=production

WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
