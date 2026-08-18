import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // API_BASE 为空时连接同源（由 Vite 代理转发 /socket.io）
    socket = io(API_BASE || "/", {
      transports: ["websocket", "polling"],
      autoConnect: true,
      withCredentials: true,
    });
  }
  return socket;
}
