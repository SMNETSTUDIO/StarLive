import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("/", {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}
