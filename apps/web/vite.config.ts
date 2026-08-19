import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  // 外部 API 地址（如远程部署），留空则代理到本地一体化服务（3000）
  const apiTarget = env.API_PROXY_TARGET || "http://localhost:3000";

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // 框架依赖单独分块：发版时业务代码更新不影响 vendor 缓存
          //（配合服务端 assets immutable 缓存，回访者只需重新下载业务 chunk）
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-socket": ["socket.io-client"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      // 仅开发热更新用；生产由 server 在 3000 端口一体化托管前端
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
        "/hls": {
          target: env.HLS_PROXY_TARGET || "http://localhost:8888",
          changeOrigin: true,
        },
      },
    },
  };
});
