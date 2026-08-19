import { useEffect, useState } from "react";
import Pagination, { pageCountOf, paginate } from "../../components/Pagination";
import Modal from "../../components/Modal";
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
  announcement?: string;
}

function EditRoomModal({ room, onClose, onSaved }: { room: AdminRoom; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(room.title);
  const [category, setCategory] = useState(room.category ?? "");
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [announcement, setAnnouncement] = useState(room.announcement ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setMsg("");
    try {
      await post("/admin/room-update", {
        roomId: room.id,
        title,
        category,
        isPublic,
        announcement,
      });
      setMsg("房间已更新");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`编辑房间 · ${room.title}`} onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      <div className="field">
        <label>房间标题</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>分类</label>
        <input
          className="input"
          placeholder="如：游戏 / 音乐 / 闲聊"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>
      <div className="field">
        <label>房间公告</label>
        <textarea
          className="input"
          placeholder="展示在房间页顶部，留空则不显示"
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
        />
      </div>
      <label className="switch" style={{ marginBottom: 18 }}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span className="track" />
        在直播广场公开展示
      </label>
      <button className="btn btn-primary" style={{ width: "100%" }} onClick={save}>
        保存修改
      </button>
      <p className="small muted" style={{ margin: "10px 0 0", textAlign: "center" }}>
        房间 ID：<code>{room.id}</code> · 房主：<code>{room.ownerId}</code>
      </p>
    </Modal>
  );
}

const PAGE_SIZE = 20;

export default function AdminRooms() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<AdminRoom | null>(null);
  const [page, setPage] = useState(1);

  const load = () => get<AdminRoom[]>("/admin/rooms").then(setRooms).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const ban = async (roomId: string, banned: boolean) => {
    await post("/admin/room-ban", { roomId, banned });
    load();
  };

  const remove = async (roomId: string) => {
    if (!confirm("确认删除该房间？此操作不可恢复")) return;
    await post("/admin/room-delete", { roomId });
    load();
  };

  const kw = keyword.trim().toLowerCase();
  const shown = kw
    ? rooms.filter(
        (r) =>
          r.title?.toLowerCase().includes(kw) ||
          r.category?.toLowerCase().includes(kw) ||
          r.ownerId?.toLowerCase().includes(kw),
      )
    : rooms;
  const pageCount = pageCountOf(shown.length, PAGE_SIZE);
  const paged = paginate(shown, Math.min(page, pageCount), PAGE_SIZE);

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>房间管理</h2>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="🔍 搜索标题 / 分类 / 房主…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>房间</th>
            <th>房主</th>
            <th>分类</th>
            <th>可见性</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={6}>
                没有匹配的房间
              </td>
            </tr>
          )}
          {paged.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title}
                <div className="muted small">{r.id}</div>
              </td>
              <td className="muted small">{r.ownerId}</td>
              <td>{r.category || "—"}</td>
              <td>
                {r.isPublic ? (
                  <span className="badge badge-ok">公开</span>
                ) : (
                  <span className="badge">私密</span>
                )}
              </td>
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
                  <button className="btn btn-sm" onClick={() => setEditing(r)}>
                    编辑
                  </button>
                  <button
                    className={`btn btn-sm ${r.banned ? "" : "btn-danger"}`}
                    onClick={() => ban(r.id, !r.banned)}
                  >
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
      <Pagination
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={shown.length}
        onChange={setPage}
      />
      {editing && (
        <EditRoomModal room={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
