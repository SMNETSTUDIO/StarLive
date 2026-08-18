import { useState } from "react";
import type { GiftDefinition } from "@starlive/shared";

/** 默认礼物 emoji（后端未配置 icon 时按 id 匹配） */
const GIFT_EMOJI: Record<string, string> = {
  heart: "💗",
  rose: "🌹",
  car: "🏎️",
  rocket: "🚀",
  crown: "👑",
};

export default function GiftPanel({
  gifts,
  onSend,
}: {
  gifts: GiftDefinition[];
  onSend: (giftId: string, count: number) => void;
}) {
  const [count, setCount] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="card">
      <h3>🎁 礼物</h3>
      <div className="grid grid-3" style={{ marginBottom: 12, gap: 10 }}>
        {gifts.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`gift-tile${selected === g.id ? " selected" : ""}`}
            aria-pressed={selected === g.id}
            onClick={() => setSelected(g.id)}
          >
            <div className="gift-emoji">{g.icon ?? GIFT_EMOJI[g.id] ?? "🎁"}</div>
            <div className="small">{g.name}</div>
            <div className="small muted">{g.price} SC</div>
          </button>
        ))}
      </div>
      <div className="flex between">
        <input
          className="input"
          type="number"
          style={{ width: 80 }}
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={!selected}
          onClick={() => selected && onSend(selected, count)}
        >
          送出
        </button>
      </div>
    </div>
  );
}
