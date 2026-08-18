import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface AdminRoom {
  id: string;
  title: string;
  ownerId: string;
  isPublic: boolean;
  category: string;
  status: string;
  banned: boolean;
  createdAt: number;
}

export default function AdminRooms() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);

  const load = () => get<AdminRoom[]>("/admin/rooms").then(setRooms).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const ban = async (roomId: string, banned: boolean) => {
    await post("/admin/room-ban", { roomId, banned });
    load();
  };

  const remove = async (roomId: string) => {
    if (!confirm("确认删除该房间？")) return;
    await post("/admin/room-delete", { roomId });
    load();
  };

  return (
    <div>
      <h2>房间管理</h2>
      <table className="table">
        <thead>
          <tr>
            <th>房间</th>
            <th>房主</th>
            <th>分类</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.ownerId}</td>
              <td>{r.category || "-"}</td>
              <td>
                {r.banned ? (
                  <span className="badge badge-live">已封禁</span>
                ) : r.status === "active" ? (
                  <span className="badge badge-ok">直播中</span>
                ) : (
                  <span className="badge">未开播</span>
                )}
              </td>
              <td>
                <div className="flex">
                  <button className="btn btn-sm" onClick={() => ban(r.id, !r.banned)}>
                    {r.banned ? "解封" : "封禁"}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
