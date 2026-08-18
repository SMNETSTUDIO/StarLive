export interface RewardRecord {
  id: string;
  fromUserId: string;
  fromName?: string;
  total: string | number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** 房间贡献榜：按打赏总额聚合 TOP 5 */
export default function RankPanel({ rewards }: { rewards: RewardRecord[] }) {
  const byUser = new Map<string, { name: string; total: number }>();
  for (const r of rewards) {
    const key = r.fromUserId;
    const cur = byUser.get(key) ?? { name: r.fromName || key, total: 0 };
    cur.total += Number(r.total ?? 0);
    if (r.fromName) cur.name = r.fromName;
    byUser.set(key, cur);
  }
  const top = [...byUser.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="card">
      <h3>💎 贡献榜</h3>
      {top.length === 0 ? (
        <div className="muted small" style={{ padding: "8px 0" }}>
          还没有人打赏，快来抢沙发
        </div>
      ) : (
        <div className="flex-col" style={{ gap: 0 }}>
          {top.map((u, i) => (
            <div className="list-row" key={u.name + i}>
              <span style={{ width: 26, textAlign: "center", fontSize: i < 3 ? 18 : 13 }}>
                {MEDALS[i] ?? `${i + 1}`}
              </span>
              <span className="grow" style={{ fontWeight: i === 0 ? 600 : 400 }}>
                {u.name}
              </span>
              <span className="small" style={{ color: "var(--yellow)", fontWeight: 600 }}>
                ⭐ {u.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
