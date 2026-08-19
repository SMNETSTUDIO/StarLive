import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MiniBars from "../components/MiniBars";
import Modal from "../components/Modal";
import { del, get, post } from "../lib/api";

interface RoomItem {
  id: string;
  title: string;
  status: string;
  category?: string;
  viewerCount: number;
  createdAt: number;
}

interface RoomDetail {
  id: string;
  title: string;
  announcement?: string;
  isPublic: boolean;
  category?: string;
  tags?: string[];
}

const CATEGORY_OPTIONS = ["游戏", "音乐", "闲聊", "户外", "学习"];

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
  // 房间设置编辑
  const [editing, setEditing] = useState<RoomDetail | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editAnnouncement, setEditAnnouncement] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openEdit = async (roomId: string) => {
    try {
      const r = await get<RoomDetail>(`/room/get?roomId=${roomId}`);
      setEditing(r);
      setEditTitle(r.title);
      setEditCategory(r.category ?? "");
      setEditTags((r.tags ?? []).join(" "));
      setEditAnnouncement(r.announcement ?? "");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onSaveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    try {
      const tags = editTags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (editTitle.trim() && editTitle.trim() !== editing.title) {
        await post("/room/update", { roomId: editing.id, title: editTitle.trim() });
      }
      await post("/room/tags-update", { roomId: editing.id, category: editCategory, tags });
      if (editAnnouncement !== (editing.announcement ?? "")) {
        await post("/room/announcement-update", { roomId: editing.id, announcement: editAnnouncement });
      }
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (roomId: string) => {
    if (!confirm("确认删除该房间？")) return;
    try {
      await del("/room/delete", { roomId });
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
                <button className="btn btn-sm" onClick={() => openEdit(r.id)}>
                  设置
                </button>
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

      {editing && (
        <Modal title="房间设置" width={480} onClose={() => setEditing(null)}>
          <div className="field">
            <label>房间标题</label>
            <input
              className="input"
              value={editTitle}
              maxLength={40}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label>分类</label>
            <div className="chips">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip ${editCategory === c ? "active" : ""}`}
                  onClick={() => setEditCategory((cur) => (cur === c ? "" : c))}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>标签（空格分隔，最多 5 个）</label>
            <input
              className="input"
              value={editTags}
              placeholder="例：怀旧 单机 硬核"
              onChange={(e) => setEditTags(e.target.value)}
            />
          </div>
          <div className="field">
            <label>房间公告</label>
            <textarea
              className="input"
              rows={2}
              maxLength={120}
              value={editAnnouncement}
              onChange={(e) => setEditAnnouncement(e.target.value)}
              placeholder="展示在直播间顶部的公告…"
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={saving}
            onClick={onSaveEdit}
          >
            {saving ? "保存中…" : "保存修改"}
          </button>
        </Modal>
      )}
    </div>
  );
}
