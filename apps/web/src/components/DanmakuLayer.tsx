import { useRef } from "react";
import type { DanmakuMessage } from "@starlive/shared";

const LANES = 12;

export default function DanmakuLayer({ messages }: { messages: DanmakuMessage[] }) {
  // 只上屏进入房间后新到的弹幕；历史消息留在聊天区，避免刷新时全量同时起跑叠成一团
  const mountTs = useRef(Date.now());
  const laneOf = useRef(new Map<string, number>());
  const nextLane = useRef(0);

  const live = messages.filter((m) => m.ts >= mountTs.current).slice(-30);

  // 轮转分配弹道，相邻弹幕不同行，避免重叠
  for (const m of live) {
    if (!laneOf.current.has(m.id)) {
      laneOf.current.set(m.id, nextLane.current);
      nextLane.current = (nextLane.current + 1) % LANES;
    }
  }
  if (laneOf.current.size > 200) {
    const keep = new Set(live.map((m) => m.id));
    for (const id of laneOf.current.keys()) if (!keep.has(id)) laneOf.current.delete(id);
  }

  return (
    <div className="danmaku-layer">
      {live.map((m) => (
        <div
          key={m.id}
          className="danmaku-item"
          style={{
            top: `${6 + (laneOf.current.get(m.id) ?? 0) * (78 / LANES)}%`,
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
