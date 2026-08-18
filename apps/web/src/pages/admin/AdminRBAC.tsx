import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface Role {
  roleId: string;
  permissions: string[];
}

const PERMISSION_OPTIONS = [
  "system.*",
  "users.*",
  "stats.read",
  "rooms.*",
  "moderation.*",
  "recordings.*",
  "withdrawals.*",
  "orders.read",
  "audit.read",
];

export default function AdminRBAC() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [roleId, setRoleId] = useState("admin");
  const [perms, setPerms] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [assignRole, setAssignRole] = useState("admin");

  const load = () => {
    get<Role[]>("/admin/roles").then(setRoles).catch(() => undefined);
    get<Record<string, string>>("/admin/user-roles").then(setUserRoles).catch(() => undefined);
  };

  useEffect(() => {
    void load();
  }, []);

  const selectRole = (r: Role) => {
    setRoleId(r.roleId);
    setPerms(r.permissions);
  };

  const toggle = (p: string) => {
    setPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const saveRole = async () => {
    await post("/admin/role-update", { roleId, permissions: perms });
    load();
  };

  const assign = async () => {
    await post("/admin/user-role-set", { userId, roleId: assignRole || null });
    load();
  };

  return (
    <div>
      <h2>权限管理（RBAC）</h2>
      <div className="grid grid-2">
        <div className="card">
          <h3>角色权限</h3>
          <div className="flex wrap" style={{ marginBottom: 12 }}>
            {roles.map((r) => (
              <button
                key={r.roleId}
                className={`btn btn-sm ${roleId === r.roleId ? "btn-primary" : ""}`}
                onClick={() => selectRole(r)}
              >
                {r.roleId}
              </button>
            ))}
            <button
              className="btn btn-sm"
              onClick={() => {
                setRoleId("new_role");
                setPerms([]);
              }}
            >
              + 新角色
            </button>
          </div>
          <div className="flex wrap">
            {PERMISSION_OPTIONS.map((p) => (
              <label className="flex small" key={p}>
                <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} />
                {p}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={saveRole}>
            保存角色
          </button>
        </div>
        <div className="card">
          <h3>分配角色</h3>
          <div className="field">
            <label>用户 ID</label>
            <input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <div className="field">
            <label>角色</label>
            <select className="select" value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
              <option value="super_admin">super_admin</option>
              {roles.map((r) => (
                <option key={r.roleId} value={r.roleId}>
                  {r.roleId}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={assign}>
            分配
          </button>
          <h3 style={{ marginTop: 20 }}>已有分配</h3>
          {Object.entries(userRoles).map(([uid, rid]) => (
            <div key={uid} className="flex between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="small">{uid}</span>
              <span className="badge">{rid}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
