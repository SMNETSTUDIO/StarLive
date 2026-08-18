import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../lib/api";

interface RoomItem {
  id: string;
  title: string;
  ownerId: string;
  category: string;
  status: string;
  viewerCount: number;
  createdAt: number;
}

export default function LiveList() {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [category, setCategory] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      get<RoomItem[]>(`/room/list${category ? `?category=${encodeURIComponent(category)}` : ""}`)
        .then((r) => alive && setRooms(r.filter((x) => x.status === "active")))
        .catch(() => undefined);
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
      <div className="flex between">
        <h2>直播广场</h2>
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="分类筛选…"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>
      {rooms.length === 0 ? (
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
              <div className="live-thumb">
                <span style={{ fontSize: 34 }}>🎥</span>
              </div>
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
