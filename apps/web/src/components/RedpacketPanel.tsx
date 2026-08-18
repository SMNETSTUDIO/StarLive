import { useState } from "react";

export interface RedpacketItem {
  id: string;
  total: number;
  count: number;
  mode: string;
  claimed: number;
  expired: boolean;
  empty: boolean;
}

export default function RedpacketPanel({
  redpackets,
  isLoggedIn,
  onClaim,
  onCreate,
}: {
  redpackets: RedpacketItem[];
  isLoggedIn: boolean;
  onClaim: (id: string) => void;
  onCreate: (total: number, count: number, mode: string) => void;
}) {
  const [total, setTotal] = useState(100);
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState("random");

  return (
    <div className="card">
      <h3>🧧 红包</h3>
      {redpackets.length === 0 && <div className="muted small">暂无红包</div>}
      <div className="flex-col" style={{ marginBottom: 12 }}>
        {redpackets.map((r) => (
          <div className="flex between" key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <div>
              <div>
                {r.total} SC · {r.claimed}/{r.count} 已抢
              </div>
              <div className="small muted">{r.mode === "random" ? "拼手气" : "均分"}</div>
            </div>
            <button
              className="btn btn-sm"
              disabled={!isLoggedIn || r.expired || r.empty}
              onClick={() => onClaim(r.id)}
            >
              {r.expired ? "已过期" : r.empty ? "已抢光" : "抢"}
            </button>
          </div>
        ))}
      </div>
      {isLoggedIn && (
        <div className="flex wrap">
          <input className="input" style={{ width: 90 }} type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
          <input className="input" style={{ width: 70 }} type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <select className="select" style={{ width: 90 }} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="random">拼手气</option>
            <option value="equal">均分</option>
          </select>
          <button className="btn btn-sm btn-primary" onClick={() => onCreate(total, count, mode)}>
            发红包
          </button>
        </div>
      )}
    </div>
  );
}
