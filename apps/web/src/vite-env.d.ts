/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 外部 API 地址（含协议，不带末尾斜杠）。留空时走同源 + Vite 代理 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
