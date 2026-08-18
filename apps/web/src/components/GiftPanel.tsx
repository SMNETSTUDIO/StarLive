import { useState } from "react";
import type { GiftDefinition } from "@starlive/shared";

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
      <div className="grid grid-3" style={{ marginBottom: 12 }}>
        {gifts.map((g) => (
          <div
            key={g.id}
            className="card"
            style={{
              padding: 10,
              textAlign: "center",
              cursor: "pointer",
              borderColor: selected === g.id ? "var(--accent)" : "var(--border)",
            }}
            onClick={() => setSelected(g.id)}
          >
            <div style={{ fontSize: 24 }}>{g.icon ?? "🎁"}</div>
            <div className="small">{g.name}</div>
            <div className="small muted">{g.price} SC</div>
          </div>
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
