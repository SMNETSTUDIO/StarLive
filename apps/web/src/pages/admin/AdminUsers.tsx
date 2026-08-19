import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import Pagination, { pageCountOf, paginate } from "../../components/Pagination";
import { get, post } from "../../lib/api";
import { downloadCsv } from "../../lib/csv";

const PAGE_SIZE = 20;

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

interface Tx {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  meta?: string;
  ts: number;
}

const TX_LABELS: Record<string, string> = {
  recharge: "充值",
  gift_send: "送礼",
  gift_receive: "收礼",
  redpacket_send: "发红包",
  redpacket_receive: "抢红包",
  withdrawal: "提现",
  admin_adjust: "管理员调整",
};

function EditUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [password, setPassword] = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<string[] | null>(null);
  const [roleId, setRoleId] = useState("");
  const [txs, setTxs] = useState<Tx[] | null>(null);

  useEffect(() => {
    // 角色列表（仅超管可见，403 时隐藏该区块）
    Promise.all([
      get<{ roleId: string }[]>("/admin/roles"),
      get<Record<string, string>>("/admin/user-roles"),
    ])
      .then(([rs, userRoles]) => {
        const ids = rs.map((r) => r.roleId);
        if (!ids.includes("super_admin")) ids.unshift("super_admin");
        setRoles(ids);
        setRoleId(userRoles[user.id] ?? "");
      })
      .catch(() => setRoles(null));
  }, [user.id]);

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

      {roles && (
        <div className="modal-section">
          <h4>🔐 管理角色</h4>
          <div className="flex">
            <select className="select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">无（普通用户）</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r === "super_admin" ? "超级管理员" : r}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm"
              onClick={() =>
                run(
                  () => post("/admin/user-role-set", { userId: user.id, roleId: roleId || null }),
                  "角色已更新（用户重新登录后生效）",
                )
              }
            >
              保存
            </button>
          </div>
        </div>
      )}

      <div className="modal-section">
        <h4>🧾 最近流水</h4>
        {txs === null ? (
          <button
            className="btn btn-sm"
            onClick={() =>
              get<Tx[]>(`/admin/user-transactions?userId=${user.id}&limit=15`)
                .then(setTxs)
                .catch((e) => setError((e as Error).message))
            }
          >
            加载最近 15 条流水
          </button>
        ) : txs.length === 0 ? (
          <div className="muted small">暂无交易记录</div>
        ) : (
          <div className="flex-col" style={{ gap: 0 }}>
            {txs.map((t) => (
              <div className="list-row" key={t.id}>
                <span className="badge">{TX_LABELS[t.type] ?? t.type}</span>
                <span
                  className="grow"
                  style={{
                    color: Number(t.amount) >= 0 ? "var(--green)" : "var(--red)",
                    fontWeight: 600,
                  }}
                >
                  {Number(t.amount) >= 0 ? `+${t.amount}` : t.amount} SC
                </span>
                <span className="muted small">余 {t.balanceAfter}</span>
                <span className="muted small">
                  {new Date(Number(t.ts)).toLocaleString("zh-CN", { hour12: false })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [page, setPage] = useState(1);

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
  const pageCount = pageCountOf(shown.length, PAGE_SIZE);
  const paged = paginate(shown, Math.min(page, pageCount), PAGE_SIZE);

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <div className="flex">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="🔍 搜索用户名 / 邮箱…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
          <button
            className="btn btn-sm"
            disabled={shown.length === 0}
            onClick={() =>
              downloadCsv(
                `users_${new Date().toISOString().slice(0, 10)}.csv`,
                ["ID", "昵称", "用户名", "邮箱", "余额(SC)", "封禁", "禁言", "注册时间"],
                shown.map((u) => [
                  u.id,
                  u.name,
                  u.username,
                  u.email,
                  u.coins,
                  u.banned ? "是" : "否",
                  u.muted ? "是" : "否",
                  new Date(u.createdAt).toLocaleString("zh-CN", { hour12: false }),
                ]),
              )
            }
          >
            ⬇︎ 导出 CSV
          </button>
        </div>
      </div>
      <div className="table-wrap">
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
          {paged.map((u) => (
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
      </div>
      <Pagination
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={shown.length}
        onChange={setPage}
      />
      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
