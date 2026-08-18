/** 外部 API 地址；留空时使用同源相对路径（由 Vite 代理转发） */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface ApiBody {
  code: number;
  message: string;
  data?: unknown;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  let body: ApiBody;
  try {
    body = (await res.json()) as ApiBody;
  } catch {
    throw new ApiError(res.status, "网络错误");
  }
  if (body.code !== 0) {
    throw new ApiError(body.code ?? res.status, body.message ?? "请求失败");
  }
  return body.data as T;
}

export function get<T = unknown>(path: string): Promise<T> {
  return api<T>(path);
}

export function post<T = unknown>(path: string, data?: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}
