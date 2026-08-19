import { useRef } from "react";
import type { DanmakuMessage } from "@starlive/shared";

const LANES = 12;
const DURATION_S = 10;
const HISTORY_MAX = 15;

export default function DanmakuLayer({
  messages,
  visible = true,
}: {
  messages: DanmakuMessage[];
  /** 用 visibility 隐藏而非卸载：卸载重挂会重置进房时间戳导致历史弹幕重放 */
  visible?: boolean;
}) {
  const mountTs = useRef(Date.now());
  const laneOf = useRef(new Map<string, number>());
  const nextLane = useRef(0);

  // 历史弹幕（进房前的）：用负延迟错开铺在屏幕各处，模拟“一直在滚”的效果，
  // 避免同一瞬间从同一点齐步走叠成一团；新弹幕正常从右边缘进场
  const history = messages.filter((m) => m.ts < mountTs.current).slice(-HISTORY_MAX);
  const live = messages.filter((m) => m.ts >= mountTs.current).slice(-30);
  const delayOf = useRef(new Map<string, number>());
  history.forEach((m, i) => {
    if (!delayOf.current.has(m.id)) {
      // 越早的历史弹幕越靠左（动画进度越深），均匀铺开在前 80% 行程
      delayOf.current.set(m.id, -((history.length - i) / (history.length + 1)) * DURATION_S * 0.8);
    }
  });

  // 轮转分配弹道，相邻弹幕错行不重叠
  const all = [...history, ...live];
  for (const m of all) {
    if (!laneOf.current.has(m.id)) {
      laneOf.current.set(m.id, nextLane.current);
      nextLane.current = (nextLane.current + 1) % LANES;
    }
  }
  if (laneOf.current.size > 200) {
    const keep = new Set(all.map((m) => m.id));
    for (const id of laneOf.current.keys()) if (!keep.has(id)) laneOf.current.delete(id);
  }

  return (
    <div className="danmaku-layer" style={visible ? undefined : { visibility: "hidden" }}>
      {all.map((m) => (
        <div
          key={m.id}
          className="danmaku-item"
          style={{
            top: `${6 + (laneOf.current.get(m.id) ?? 0) * (78 / LANES)}%`,
            color: m.color,
            animationDuration: `${DURATION_S}s`,
            animationDelay: `${delayOf.current.get(m.id) ?? 0}s`,
          }}
        >
          {m.name}: {m.content}
        </div>
      ))}
    </div>
  );
}
