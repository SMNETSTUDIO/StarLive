import { useEffect, useState } from "react";
import { get } from "../../lib/api";

interface Stats {
  users: number;
  rooms: number;
  publicRooms: number;
  pendingWithdrawals: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    get<Stats>("/admin/stats").then(setStats).catch(() => undefined);
  }, []);

  return (
    <div>
      <h2>概览</h2>
      <div className="grid grid-3">
        <div className="stat-card">
          <div className="muted small">用户总数</div>
          <div className="num">{stats?.users ?? "-"}</div>
        </div>
        <div className="stat-card">
          <div className="muted small">房间总数</div>
          <div className="num">{stats?.rooms ?? "-"}</div>
        </div>
        <div className="stat-card">
          <div className="muted small">公开房间</div>
          <div className="num">{stats?.publicRooms ?? "-"}</div>
        </div>
        <div className="stat-card">
          <div className="muted small">待处理提现</div>
          <div className="num">{stats?.pendingWithdrawals ?? "-"}</div>
        </div>
      </div>
    </div>
  );
}
