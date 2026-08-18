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

  const load = () => get<AdminUser[]>("/admin/users").then(setUsers).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const flag = async (userId: string, field: "banned" | "muted", value: boolean) => {
    await post("/admin/user-flag", { userId, field, value });
    load();
  };

  return (
    <div>
      <h2>用户管理</h2>
      <table className="table">
        <thead>
          <tr>
            <th>用户名</th>
            <th>邮箱</th>
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email ?? "-"}</td>
              <td>
                {u.banned && <span className="badge badge-live">封禁</span>}
                {u.muted && <span className="badge badge-warn">禁言</span>}
                {!u.banned && !u.muted && <span className="badge badge-ok">正常</span>}
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <div className="flex">
                  <button className="btn btn-sm" onClick={() => flag(u.id, "banned", !u.banned)}>
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
