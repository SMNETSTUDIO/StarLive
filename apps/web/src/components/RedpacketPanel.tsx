import { memo, useState } from "react";

export interface RedpacketItem {
  id: string;
  total: number;
  count: number;
  mode: string;
  claimed: number;
  expired: boolean;
  empty: boolean;
}

function RedpacketPanel({
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
      {redpackets.length === 0 && (
        <div className="muted small" style={{ padding: "8px 0 12px" }}>
          暂无红包，发一个活跃气氛吧
        </div>
      )}
      <div className="flex-col" style={{ marginBottom: 12, gap: 8 }}>
        {redpackets.map((r) => {
          const done = r.expired || r.empty;
          return (
            <div className={`rp-row${done ? " done" : ""}`} key={r.id}>
              <span className="rp-icon">🧧</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {r.total} SC
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    {r.mode === "random" ? "拼手气" : "均分"} · {r.claimed}/{r.count} 已抢
                  </span>
                </div>
                <div className="rp-progress">
                  <span style={{ width: `${Math.min(100, (r.claimed / r.count) * 100)}%` }} />
                </div>
              </div>
              <button
                className={`btn btn-sm${done ? "" : " rp-claim"}`}
                disabled={!isLoggedIn || done}
                onClick={() => onClaim(r.id)}
              >
                {r.expired ? "已过期" : r.empty ? "已抢光" : "抢"}
              </button>
            </div>
          );
        })}
      </div>
      {isLoggedIn && (
        <div className="flex wrap" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ width: 88 }}
            type="number"
            title="总金额（SC）"
            placeholder="金额"
            value={total}
            onChange={(e) => setTotal(Number(e.target.value))}
          />
          <input
            className="input"
            style={{ width: 68 }}
            type="number"
            title="红包个数"
            placeholder="个数"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <select
            className="select"
            style={{ width: 92 }}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="random">拼手气</option>
            <option value="equal">均分</option>
          </select>
          <button
            className="btn btn-sm rp-claim"
            style={{ flex: 1 }}
            onClick={() => onCreate(total, count, mode)}
          >
            发红包
          </button>
        </div>
      )}
    </div>
  );
}

/** 弹幕高频重渲染时跳过（props 稳定引用由 Room useCallback 保证） */
export default memo(RedpacketPanel);
