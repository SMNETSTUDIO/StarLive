import { useEffect, useRef, useState } from "react";
import type { DanmakuMessage } from "@starlive/shared";

const EMOJIS = [
  "😀", "😂", "🤣", "😍", "😎", "🥳", "😭", "🤔",
  "👍", "👏", "🙌", "💪", "🔥", "❤️", "💖", "✨",
  "🎉", "🎊", "🚀", "⭐", "🌹", "🧧", "😱", "666",
];

export default function ChatPanel({
  messages,
  onSend,
}: {
  messages: DanmakuMessage[];
  onSend: (content: string) => void;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
    setShowEmoji(false);
  };

  const addEmoji = (e: string) => {
    setText((t) => (t + e).slice(0, 30));
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
      {showEmoji && (
        <div className="emoji-panel">
          {EMOJIS.map((e) => (
            <button key={e} className="emoji-btn" onClick={() => addEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="flex" style={{ gap: 8 }}>
        <button
          className={`btn btn-sm btn-ghost${showEmoji ? " emoji-active" : ""}`}
          style={{ padding: "6px 10px", fontSize: 17 }}
          title="表情"
          aria-label="表情面板"
          aria-expanded={showEmoji}
          onClick={() => setShowEmoji((v) => !v)}
        >
          😀
        </button>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            className="input"
            placeholder="发条弹幕…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={30}
          />
          {text.length >= 20 && (
            <span className="chat-counter">{text.length}/30</span>
          )}
        </div>
        <button className="btn btn-primary" onClick={submit}>
          发送
        </button>
      </div>
    </div>
  );
}
