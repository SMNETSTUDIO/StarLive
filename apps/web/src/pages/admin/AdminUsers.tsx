import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { get, post } from "../../lib/api";

interface AdminUser {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  banned: boolean;
  muted: boolean;
  coins: number;
  createdAt: number;
}

function EditUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [password, setPassword] = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError("");
    setMsg("");
    try {
      await fn();
      setMsg(okMsg);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`编辑用户 · ${user.name}`} onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="field">
        <label>昵称</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>邮箱</label>
        <input
          className="input"
          type="email"
          placeholder="留空表示清除邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label>头像 URL</label>
        <input
          className="input"
          placeholder="https://…"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary"
        style={{ width: "100%" }}
        onClick={() => run(() => post("/admin/user-update", { userId: user.id, name, email, avatarUrl }), "资料已保存")}
      >
        保存资料
      </button>

      <div className="modal-section">
        <h4>🔑 重置密码</h4>
        <div className="flex">
          <input
            className="input"
            type="password"
            placeholder="新密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="btn btn-sm"
            disabled={password.length < 6}
            onClick={() =>
              run(async () => {
                await post("/admin/user-password", { userId: user.id, password });
                setPassword("");
              }, "密码已重置")
            }
          >
            重置
          </button>
        </div>
      </div>

      <div className="modal-section">
        <h4>⭐ 余额调整（当前 {user.coins} SC）</h4>
        <div className="flex">
          <input
            className="input"
            type="number"
            style={{ width: 110 }}
            placeholder="±数额"
            value={delta || ""}
            onChange={(e) => setDelta(Number(e.target.value))}
          />
          <input
            className="input"
            placeholder="原因（记入流水）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn btn-sm"
            disabled={!delta}
            onClick={() =>
              run(async () => {
                await post("/admin/balance-adjust", { userId: user.id, delta, reason });
                setDelta(0);
                setReason("");
              }, "余额已调整")
            }
          >
            调整
          </button>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          正数增加、负数扣减，操作会写入用户交易流水与审计日志
        </p>
      </div>
    </Modal>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const load = () => get<AdminUser[]>("/admin/users").then(setUsers).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const flag = async (userId: string, field: "banned" | "muted", value: boolean) => {
    await post("/admin/user-flag", { userId, field, value });
    load();
  };

  const kw = keyword.trim().toLowerCase();
  const shown = kw
    ? users.filter(
        (u) =>
          u.name?.toLowerCase().includes(kw) ||
          u.username?.toLowerCase().includes(kw) ||
          u.email?.toLowerCase().includes(kw),
      )
    : users;

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="🔍 搜索用户名 / 邮箱…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>用户</th>
            <th>邮箱</th>
            <th>余额</th>
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={6}>
                没有匹配的用户
              </td>
            </tr>
          )}
          {shown.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="flex" style={{ gap: 10 }}>
                  <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : u.name?.[0] ?? "U"}
                  </span>
                  <div>
                    {u.name}
                    <div className="muted small">@{u.username}</div>
                  </div>
                </div>
              </td>
              <td className="muted">{u.email || "—"}</td>
              <td>⭐ {u.coins}</td>
              <td>
                {u.banned && <span className="badge badge-live">封禁</span>}
                {u.muted && <span className="badge badge-warn">禁言</span>}
                {!u.banned && !u.muted && <span className="badge badge-ok">正常</span>}
              </td>
              <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <div className="flex">
                  <button className="btn btn-sm" onClick={() => setEditing(u)}>
                    编辑
                  </button>
                  <button
                    className={`btn btn-sm ${u.banned ? "" : "btn-danger"}`}
                    onClick={() => flag(u.id, "banned", !u.banned)}
                  >
                    {u.banned ? "解封" : "封禁"}
                  </button>
                  <button className="btn btn-sm" onClick={() => flag(u.id, "muted", !u.muted)}>
                    {u.muted ? "解除禁言" : "禁言"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
