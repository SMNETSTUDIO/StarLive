import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface AdminUser {
  id: string;
  name: string;
  username: string;
  email?: string;
  banned: boolean;
  muted: boolean;
  createdAt: number;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState("");

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
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={5}>
                没有匹配的用户
              </td>
            </tr>
          )}
          {shown.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="flex" style={{ gap: 10 }}>
                  <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                    {u.name?.[0] ?? "U"}
                  </span>
                  <div>
                    {u.name}
                    <div className="muted small">@{u.username}</div>
                  </div>
                </div>
              </td>
              <td className="muted">{u.email || "—"}</td>
              <td>
                {u.banned && <span className="badge badge-live">封禁</span>}
                {u.muted && <span className="badge badge-warn">禁言</span>}
                {!u.banned && !u.muted && <span className="badge badge-ok">正常</span>}
              </td>
              <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <div className="flex">
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
    </div>
  );
}
