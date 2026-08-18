import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../lib/api";

interface RoomItem {
  id: string;
  title: string;
  status: string;
  viewerCount: number;
  createdAt: number;
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    get<RoomItem[]>("/room/list?mine=true")
      .then(setRooms)
      .catch((e) => setError((e as Error).message));
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

  return (
    <div className="container">
      <h2>我的房间</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {rooms.length === 0 ? (
        <div className="empty">还没有房间，去 <Link to="/">创建</Link> 一个</div>
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
