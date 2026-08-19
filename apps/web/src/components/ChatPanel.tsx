import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { DanmakuMessage } from "@starlive/shared";

const EMOJIS = [
  "😀", "😂", "🤣", "😍", "😎", "🥳", "😭", "🤔",
  "👍", "👏", "🙌", "💪", "🔥", "❤️", "💖", "✨",
  "🎉", "🎊", "🚀", "⭐", "🧧", "🌹", "😱", "666",
];

function fmtCountdown(until: number): string {
  const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  if (s >= 3600) return `${Math.ceil(s / 3600)} 小时`;
  if (s >= 60) return `${Math.ceil(s / 60)} 分钟`;
  return `${s} 秒`;
}

/**
 * 禁言横幅：自持倒计时，1s tick 只重渲染本横幅，
 * 不再连累整个 ChatPanel（消息列表/输入框）每秒重绘。
 */
function MutedBanner({ mutedUntil }: { mutedUntil: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (mutedUntil === Infinity) return;
    const t = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [mutedUntil]);
  return (
    <div className="alert" style={{ margin: 0, textAlign: "center" }}>
      🔇 你已被禁言
      {mutedUntil !== Infinity && <>，{fmtCountdown(mutedUntil)}后恢复</>}
    </div>
  );
}

export default function ChatPanel({
  messages,
  onSend,
  canModerate = false,
  onMute,
  mutedUntil = 0,
}: {
  messages: DanmakuMessage[];
  onSend: (content: string) => void;
  /** 房主/房管：在消息上展示禁言按钮 */
  canModerate?: boolean;
  onMute?: (m: DanmakuMessage) => void;
  /** 我被禁言到（ms 时间戳；Infinity = 永久；0 = 未禁言） */
  mutedUntil?: number;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // 是否禁言由 props 直接判定；倒计时刷新下放到 MutedBanner，避免整面板每秒重渲染
  const isMuted = mutedUntil === Infinity || mutedUntil > Date.now();

  const submit = () => {
    if (!text.trim() || isMuted) return;
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
            {m.userId ? (
              <Link className="nick" style={{ color: m.color }} to={`/user/${m.userId}`}>
                {m.name}
              </Link>
            ) : (
              <span className="nick" style={{ color: m.color }}>
                {m.name}
              </span>
            )}
            ：{m.content}
            {canModerate && onMute && (m.userId || m.guestId) && (
              <button
                className="chat-mute-btn"
                title={`禁言 ${m.name}`}
                aria-label={`禁言 ${m.name}`}
                onClick={() => onMute(m)}
              >
                🔇
              </button>
            )}
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
      {isMuted ? (
        <MutedBanner mutedUntil={mutedUntil} />
      ) : (
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
              aria-label="弹幕内容"
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
      )}
    </div>
  );
}
