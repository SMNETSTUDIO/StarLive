import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LiveThumb from "../components/LiveThumb";
import { get } from "../lib/api";

interface RoomItem {
  id: string;
  title: string;
  ownerId: string;
  category: string;
  status: string;
  playbackUrl?: string;
  viewerCount: number;
  createdAt: number;
}

const CATEGORIES = [
  { label: "全部", value: "" },
  { label: "🎮 游戏", value: "游戏" },
  { label: "🎵 音乐", value: "音乐" },
  { label: "💬 闲聊", value: "闲聊" },
  { label: "🏕️ 户外", value: "户外" },
  { label: "📚 学习", value: "学习" },
];

export default function LiveList() {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = () => {
      get<RoomItem[]>(`/room/list${category ? `?category=${encodeURIComponent(category)}` : ""}`)
        .then((r) => {
          if (!alive) return;
          setRooms(r.filter((x) => x.status === "active"));
          setLoading(false);
        })
        .catch(() => alive && setLoading(false));
    };
    load();
    const timer = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [category]);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h2 className="page-title">直播广场</h2>
          <p className="page-sub">正在进行的直播，列表自动刷新</p>
        </div>
        <div className="page-actions chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              className={`chip${category === c.value ? " active" : ""}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {loading && rooms.length === 0 ? (
        <div className="grid grid-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div className="card" key={i}>
              <span className="skeleton skeleton-card" style={{ height: 140 }} />
              <span className="skeleton skeleton-line" style={{ width: "60%", marginTop: 14 }} />
              <span className="skeleton skeleton-line" style={{ width: "35%", marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="empty" style={{ padding: "80px 0" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📺</div>
          <p style={{ margin: "0 0 18px" }}>暂时没有正在进行的直播</p>
          <Link className="btn btn-primary" to="/">
            去开一场直播
          </Link>
        </div>
      ) : (
        <div className="grid grid-3">
          {rooms.map((r) => (
            <Link
              to={`/room/${r.id}`}
              key={r.id}
              className="card card-hover"
              style={{ color: "inherit" }}
            >
              <LiveThumb roomId={r.id} playbackUrl={r.playbackUrl} />
              <div className="flex between" style={{ marginTop: 14 }}>
                <span className="badge badge-live">直播中</span>
                <span className="badge">👀 {r.viewerCount}</span>
              </div>
              <h3 style={{ margin: "10px 0 2px", fontSize: 16 }}>{r.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {r.category || "未分类"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
