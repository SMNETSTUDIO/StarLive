import { useEffect, useState } from "react";
import { get } from "../../lib/api";

interface Stats {
  users: number;
  rooms: number;
  publicRooms: number;
  pendingWithdrawals: number;
}

const CARDS: {
  key: keyof Stats;
  label: string;
  icon: string;
  tint: string;
}[] = [
  { key: "users", label: "用户总数", icon: "👤", tint: "rgba(10, 132, 255, 0.16)" },
  { key: "rooms", label: "房间总数", icon: "📺", tint: "rgba(94, 92, 230, 0.16)" },
  { key: "publicRooms", label: "公开房间", icon: "🌐", tint: "rgba(48, 209, 88, 0.14)" },
  {
    key: "pendingWithdrawals",
    label: "待处理提现",
    icon: "💸",
    tint: "rgba(255, 214, 10, 0.12)",
  },
];

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    get<Stats>("/admin/stats").then(setStats).catch(() => undefined);
  }, []);

  return (
    <div>
      <h2>概览</h2>
      <div className="grid grid-4">
        {CARDS.map((c) => (
          <div className="stat-card" key={c.key}>
            <span className="stat-icon" style={{ background: c.tint }}>
              {c.icon}
            </span>
            <div className="muted small">{c.label}</div>
            <div className="num">{stats?.[c.key] ?? "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
