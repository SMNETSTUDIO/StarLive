import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MiniBars from "../components/MiniBars";
import { get, post } from "../lib/api";

interface RoomItem {
  id: string;
  title: string;
  status: string;
  viewerCount: number;
  createdAt: number;
}

interface Earnings {
  days: number;
  totalCoins: number;
  totalCount: number;
  trend: { date: string; coins: number; count: number }[];
  rooms: { roomId: string; title: string; coins: number; count: number }[];
  topGifters: { userId: string; name: string; coins: number; count: number }[];
  recent: {
    id: string;
    roomId: string;
    fromName: string;
    giftName: string;
    count: number;
    total: number;
    ts: number;
  }[];
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    get<RoomItem[]>("/room/list?mine=true")
      .then(setRooms)
      .catch((e) => setError((e as Error).message));
    get<Earnings>("/gift/earnings?days=14")
      .then(setEarnings)
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (roomId: string) => {
    if (!confirm("确认删除该房间？")) return;
    try {
      await post("/room/delete", { roomId });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // 房间级收益（近 14 天），用于房间卡片展示
  const roomCoins = new Map(earnings?.rooms.map((r) => [r.roomId, r.coins]) ?? []);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h2 className="page-title">主播中心</h2>
          <p className="page-sub">房间管理与近 14 天礼物收益</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-sm" to="/">
            创建房间
          </Link>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {earnings && rooms.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="flex between">
              <h3 style={{ margin: 0, fontSize: 14 }}>💰 礼物收益（{earnings.days} 天）</h3>
              <span className="muted small">
                {earnings.totalCoins} SC · {earnings.totalCount} 件
              </span>
            </div>
            <MiniBars
              values={earnings.trend.map((t) => t.coins)}
              labels={earnings.trend.map((t) => t.date)}
              color="#ffd60a"
              format={(v) => `${v} SC`}
            />
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>🏆 金主榜（{earnings.days} 天）</h3>
            {earnings.topGifters.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>暂无打赏记录</p>
            ) : (
              <div className="flex-col" style={{ gap: 6 }}>
                {earnings.topGifters.slice(0, 5).map((g, i) => (
                  <div className="flex between small" key={g.userId || g.name}>
                    <span>
                      <span className="muted" style={{ marginRight: 6 }}>{i + 1}.</span>
                      {g.name}
                    </span>
                    <b style={{ color: "var(--gold, #ffd60a)" }}>{g.coins} SC</b>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>🎁 最近打赏</h3>
            {earnings.recent.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>暂无打赏记录</p>
            ) : (
              <div className="flex-col" style={{ gap: 6 }}>
                {earnings.recent.slice(0, 5).map((r) => (
                  <div className="flex between small" key={r.id}>
                    <span
                      style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {r.fromName} 送出 {r.giftName} ×{r.count}
                    </span>
                    <span className="muted" style={{ flexShrink: 0, marginLeft: 8 }}>
                      +{r.total} SC
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <h3 style={{ margin: "0 0 12px" }}>我的房间</h3>
      {rooms.length === 0 ? (
        <div className="empty" style={{ padding: "80px 0" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎬</div>
          <p style={{ margin: "0 0 18px" }}>还没有属于你的直播间</p>
          <Link className="btn btn-primary" to="/">
            创建第一个房间
          </Link>
        </div>
      ) : (
        <div className="flex-col">
          {rooms.map((r) => (
            <div className="card flex between" key={r.id}>
              <div>
                <div className="flex">
                  <h3 style={{ margin: 0 }}>{r.title}</h3>
                  <span className={`badge ${r.status === "active" ? "badge-live" : ""}`}>
                    {r.status === "active" ? "直播中" : "未开播"}
                  </span>
                </div>
                <p className="muted small">
                  房间号：{r.id} · {r.viewerCount} 人在看
                  {earnings && (
                    <> · 近 {earnings.days} 天收益 <b>{roomCoins.get(r.id) ?? 0}</b> SC</>
                  )}
                </p>
              </div>
              <div className="flex">
                <Link className="btn btn-sm" to={`/room/${r.id}`}>
                  进入
                </Link>
                <Link className="btn btn-sm" to={`/room/${r.id}/recordings`}>
                  录播
                </Link>
                <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
