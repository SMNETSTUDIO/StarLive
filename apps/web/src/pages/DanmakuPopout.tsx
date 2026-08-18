import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { DanmakuMessage } from "@starlive/shared";
import { useAuth } from "../context/AuthContext";
import { get, post } from "../lib/api";
import { getGuestId } from "../lib/guest";
import { getSocket } from "../lib/socket";

export default function DanmakuPopout() {
  const { roomId = "" } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DanmakuMessage[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    get<DanmakuMessage[]>(`/danmaku/recent?roomId=${roomId}`).then(setMessages).catch(() => undefined);
    const socket = getSocket();
    socket.emit("join_room", { roomId });
    const onDanmaku = (m: DanmakuMessage) => setMessages((prev) => [...prev.slice(-100), m]);
    socket.on("danmaku", onDanmaku);
    return () => {
      socket.emit("leave_room", { roomId });
      socket.off("danmaku", onDanmaku);
    };
  }, [roomId]);

  const send = async () => {
    if (!text.trim()) return;
    await post("/danmaku/send", {
      roomId,
      content: text.trim(),
      guestId: user ? undefined : getGuestId(),
      name: user?.name ?? "游客",
    });
    setText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", padding: 12 }}>
      <div style={{ flex: 1, overflowY: "auto", fontSize: 18 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 6 }}>
            <span style={{ color: m.color, fontWeight: 600 }}>{m.name}</span>：{m.content}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={30}
        />
        <button className="btn btn-primary" onClick={send}>
          发送
        </button>
      </div>
    </div>
  );
}
