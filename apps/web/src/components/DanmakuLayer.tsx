import type { DanmakuMessage } from "@starlive/shared";

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export default function DanmakuLayer({ messages }: { messages: DanmakuMessage[] }) {
  const recent = messages.slice(-30);
  return (
    <div className="danmaku-layer">
      {recent.map((m) => (
        <div
          key={m.id}
          className="danmaku-item"
          style={{
            top: `${12 + (hash(m.id) % 70)}%`,
            color: m.color,
            animationDuration: "10s",
          }}
        >
          {m.name}: {m.content}
        </div>
      ))}
    </div>
  );
}
