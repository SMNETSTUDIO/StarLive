import { useEffect, useRef, useState } from "react";
import type { DanmakuMessage } from "@starlive/shared";

export default function ChatPanel({
  messages,
  onSend,
}: {
  messages: DanmakuMessage[];
  onSend: (content: string) => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="card flex-col" style={{ height: "100%", minHeight: 300 }}>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty small" style={{ padding: "36px 0" }}>
            💬 还没有弹幕，来发第一条吧
          </div>
        )}
        {messages.map((m) => (
          <div className="chat-msg" key={m.id}>
            <span className="nick" style={{ color: m.color }}>
              {m.name}
            </span>
            ：{m.content}
          </div>
        ))}
      </div>
      <div className="flex">
        <input
          className="input"
          placeholder="发条弹幕…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={30}
        />
        <button className="btn btn-primary" onClick={submit}>
          发送
        </button>
      </div>
    </div>
  );
}
