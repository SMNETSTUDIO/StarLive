import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MiniBars from "../../components/MiniBars";
import { get } from "../../lib/api";

interface Stats {
  users: number;
  rooms: number;
  publicRooms: number;
  pendingWithdrawals: number;
}

interface UserRow {
  id: string;
  name: string;
  username: string;
  banned?: boolean;
  createdAt?: string | number;
}

interface RoomRow {
  id: string;
  title: string;
  status: string;
  category?: string;
  createdAt?: string | number;
}

interface TrendPoint {
  date: string;
  users: number;
  rooms: number;
  revenue: number;
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

const FEATURE_LABELS: Record<string, string> = {
  maintenanceEnabled: "维护模式",
  registrationEnabled: "开放注册",
  recordingEnabled: "录播",
  transcodingEnabled: "转码",
  lotteryEnabled: "抽奖",
  publicListEnabled: "公开列表",
};

function fmtTime(ts?: string | number): string {
  if (!ts) return "";
  const d = new Date(Number(ts));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  useEffect(() => {
    get<TrendPoint[]>("/admin/trends").then(setTrends).catch(() => undefined);
    get<Stats>("/admin/stats").then(setStats).catch(() => undefined);
    get<UserRow[]>("/admin/users")
      .then((r) =>
        setUsers(
          [...r].sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)).slice(0, 6),
        ),
      )
      .catch(() => undefined);
    get<RoomRow[]>("/admin/rooms")
      .then((r) =>
        setRooms(
          [...r].sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)).slice(0, 6),
        ),
      )
      .catch(() => undefined);
    get<Record<string, boolean>>("/admin/features").then(setFeatures).catch(() => undefined);
  }, []);

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>概览</h2>
        {features && (
          <div className="flex wrap" style={{ gap: 6 }}>
            {Object.entries(FEATURE_LABELS).map(([k, label]) => (
              <span key={k} className={`badge ${features[k] ? "badge-ok" : ""}`}>
                {label} {features[k] ? "开" : "关"}
              </span>
            ))}
          </div>
        )}
      </div>
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

      {trends.length > 0 && (
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="flex between">
              <h3 style={{ margin: 0, fontSize: 14 }}>📈 新增用户（14 天）</h3>
              <span className="muted small">{trends.reduce((s, t) => s + t.users, 0)}</span>
            </div>
            <MiniBars
              values={trends.map((t) => t.users)}
              labels={trends.map((t) => t.date)}
              color="#0a84ff"
              format={(v) => `${v} 人`}
            />
          </div>
          <div className="card">
            <div className="flex between">
              <h3 style={{ margin: 0, fontSize: 14 }}>📺 新增房间（14 天）</h3>
              <span className="muted small">{trends.reduce((s, t) => s + t.rooms, 0)}</span>
            </div>
            <MiniBars
              values={trends.map((t) => t.rooms)}
              labels={trends.map((t) => t.date)}
              color="#5e5ce6"
              format={(v) => `${v} 个`}
            />
          </div>
          <div className="card">
            <div className="flex between">
              <h3 style={{ margin: 0, fontSize: 14 }}>💰 充值收入（14 天）</h3>
              <span className="muted small">
                ¥{trends.reduce((s, t) => s + t.revenue, 0).toFixed(2)}
              </span>
            </div>
            <MiniBars
              values={trends.map((t) => t.revenue)}
              labels={trends.map((t) => t.date)}
              color="#30d158"
              format={(v) => `¥${v.toFixed(2)}`}
            />
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="flex between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>🆕 最近注册</h3>
            <Link className="small" to="/admin/users">
              全部用户 ›
            </Link>
          </div>
          {users.length === 0 && <div className="empty small">暂无用户</div>}
          {users.map((u) => (
            <div className="list-row" key={u.id}>
              <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                {u.name?.[0] ?? "U"}
              </span>
              <span className="grow">
                {u.name}
                <span className="muted small" style={{ marginLeft: 8 }}>
                  @{u.username}
                </span>
              </span>
              {u.banned && <span className="badge badge-warn">封禁</span>}
              <span className="muted small">{fmtTime(u.createdAt)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>📺 最近房间</h3>
            <Link className="small" to="/admin/rooms">
              全部房间 ›
            </Link>
          </div>
          {rooms.length === 0 && <div className="empty small">暂无房间</div>}
          {rooms.map((r) => (
            <div className="list-row" key={r.id}>
              <span className="grow">
                {r.title}
                {r.category && (
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    {r.category}
                  </span>
                )}
              </span>
              <span className={`badge ${r.status === "active" ? "badge-live" : ""}`}>
                {r.status === "active" ? "直播中" : "未开播"}
              </span>
              <span className="muted small">{fmtTime(r.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
