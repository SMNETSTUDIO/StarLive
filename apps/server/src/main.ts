import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import type { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters";
import { TransformInterceptor } from "./common/interceptor";
import { config } from "./config/config";

/** /hls 反向代理到 MediaMTX（单端口部署，路径原样透传，与 Vite 代理行为一致） */
function hlsProxy(target: string) {
  const base = new URL(target);
  const isHttps = base.protocol === "https:";
  const client = isHttps ? https : http;
  // 长连接复用：HLS 每几秒拉一次分片，避免每个分片都重新 TCP 握手
  const agent = isHttps
    ? new https.Agent({ keepAlive: true, maxSockets: 128 })
    : new http.Agent({ keepAlive: true, maxSockets: 128 });
  return (req: Request, res: Response): void => {
    const proxyReq = client.request(
      {
        agent,
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        path: req.originalUrl,
        method: req.method,
        headers: { ...req.headers, host: base.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end("hls upstream unavailable");
    });
    req.pipe(proxyReq);
  };
}

async function bootstrap(): Promise<void> {
  // rawBody: Stripe 等 Webhook 签名校验需要原始请求体
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // gzip 压缩：JS/CSS/JSON 体积缩小 3-4 倍（HLS 媒体流已压缩，跳过）
  app.use(
    compression({
      filter: (req: Request, res: Response) =>
        !req.path.startsWith("/hls") && compression.filter(req, res),
    }),
  );

  // 单端口一体化：/hls 转发到 MediaMTX
  app.use("/hls", hlsProxy(config.hlsProxyTarget));

  // 单端口一体化：托管前端构建产物 + SPA 回退
  const webDist = config.webDist || path.resolve(__dirname, "../../web/dist");
  const hasWeb = fs.existsSync(path.join(webDist, "index.html"));
  if (hasWeb) {
    app.useStaticAssets(webDist, {
      index: "index.html",
      setHeaders: (res: Response, filePath: string) => {
        // Vite 产物带内容哈希可永久缓存；index.html 实时校验以感知新版本
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      const p = req.path;
      if (
        req.method !== "GET" ||
        p.startsWith("/api") ||
        p.startsWith("/socket.io") ||
        p.startsWith("/hls") ||
        path.extname(p) !== ""
      ) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  // 优雅退出：容器停机时先停止接收新连接，让在途请求/WS 平滑收尾
  app.enableShutdownHooks();
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] ${sig} 收到，正在关闭…`);
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen(config.port, config.host);
  // eslint-disable-next-line no-console
  console.log(
    `StarLive listening on http://${config.host}:${config.port}` +
      (hasWeb ? " (web + api)" : "/api (web dist not found, api only)"),
  );
}

void bootstrap();
