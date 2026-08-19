import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, type User } from "../context/AuthContext";
import { API_BASE, get, post } from "../lib/api";

interface Balance {
  coins: number;
  totalRecharged: number;
  totalWithdrawn: number;
}

interface Tx {
  id: string;
  type: string;
  amount: number | string;
  balanceAfter: number | string;
  meta?: string;
  ts: number | string;
}

interface FollowingItem {
  userId: string;
  name: string;
  avatarUrl?: string;
  roomId?: string;
  live: boolean;
}

const TX_LABELS: Record<string, string> = {
  recharge: "充值",
  gift_send: "送礼",
  gift_receive: "收礼",
  redpacket_send: "发红包",
  redpacket_receive: "抢红包",
  withdrawal: "提现",
  admin_adjust: "系统调整",
};

export default function Profile() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [followings, setFollowings] = useState<FollowingItem[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [oauth, setOauth] = useState<{ enabled: boolean; name: string } | null>(null);
  const [bind, setBind] = useState<{ bound: boolean; boundName: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadFollowings = () =>
    get<FollowingItem[]>("/room/following").then(setFollowings).catch(() => undefined);

  const loadBind = () =>
    get<{ bound: boolean; boundName: string }>("/auth/oauth-bind-status")
      .then(setBind)
      .catch(() => undefined);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

  useEffect(() => {
    get<Balance>("/balance").then(setBalance).catch(() => undefined);
    get<Tx[]>("/balance/transactions?limit=20").then(setTxs).catch(() => undefined);
    get<{ enabled: boolean; name: string }>("/auth/oauth-status").then(setOauth).catch(() => undefined);
    void loadFollowings();
    void loadBind();
  }, []);

  // OAuth 绑定回跳结果提示
  useEffect(() => {
    const ok = searchParams.get("oauth_bind");
    const err = searchParams.get("oauth_bind_error");
    if (!ok && !err) return;
    if (ok) setMsg("OAuth 账号绑定成功");
    if (err) setError(err);
    searchParams.delete("oauth_bind");
    searchParams.delete("oauth_bind_error");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unfollow = async (targetUserId: string) => {
    try {
      await post("/room/unfollow", { targetUserId });
      void loadFollowings();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!user) {
    return (
      <div className="status-page">
        <span className="status-icon">🔒</span>
        <h2>请先登录</h2>
        <Link className="btn btn-primary" to="/login">
          去登录
        </Link>
      </div>
    );
  }

  const flash = (m: string) => {
    setError("");
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await post<{ user: User }>("/auth/profile-update", { name, email, avatarUrl });
      await refresh();
      flash("资料已保存");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const changePwd = async (e: FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setError("两次输入的新密码不一致");
      return;
    }
    try {
      await post("/auth/password-change", { oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      flash("密码已修改");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      {/* 头部 */}
      <div className="flex" style={{ gap: 18, margin: "12px 0 24px" }}>
        <span
          className="avatar"
          style={{
            width: 72,
            height: 72,
            fontSize: 30,
            background: avatarUrl ? undefined : "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            border: "none",
            boxShadow: "0 10px 30px rgba(10, 132, 255, 0.3)",
          }}
        >
          {avatarUrl ? <img src={avatarUrl} alt="" /> : user.name?.[0] ?? "U"}
        </span>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{user.name}</h1>
          <span className="muted small">
            @{user.username}
            {user.isSuperAdmin && (
              <span className="badge badge-ok" style={{ marginLeft: 8 }}>
                超级管理员
              </span>
            )}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="grid grid-2">
        {/* 资料 */}
        <div className="card">
          <h3 style={{ fontSize: 16 }}>👤 个人资料</h3>
          <form onSubmit={saveProfile}>
            <div className="field">
              <label>昵称</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>邮箱（可用于登录）</label>
              <input
                className="input"
                type="email"
                placeholder="留空表示不设置"
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
            <button className="btn btn-primary" style={{ width: "100%" }}>
              保存资料
            </button>
          </form>
        </div>

        {/* 密码 */}
        <div className="card">
          <h3 style={{ fontSize: 16 }}>🔑 修改密码</h3>
          <form onSubmit={changePwd}>
            <div className="field">
              <label>当前密码（OAuth 账号首次设置可留空）</label>
              <input
                className="input"
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
              />
            </div>
            <div className="field">
              <label>新密码（至少 6 位）</label>
              <input
                className="input"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>确认新密码</label>
              <input
                className="input"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
              />
            </div>
            <button className="btn" style={{ width: "100%" }}>
              修改密码
            </button>
          </form>

          {/* OAuth 账号绑定 */}
          {oauth?.enabled && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 16 }}>🔗 {oauth.name} 绑定</h3>
              {bind?.bound ? (
                <div className="flex between" style={{ gap: 10 }}>
                  <span className="small">
                    已绑定{bind.boundName ? <>：<b>{bind.boundName}</b></> : null}
                    <span className="muted">（可直接用 {oauth.name} 登录本账号）</span>
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={async () => {
                      if (!confirm(`确认解绑 ${oauth.name}？解绑后需用密码登录`)) return;
                      try {
                        await post("/auth/oauth-unbind");
                        flash("已解绑");
                        void loadBind();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    解绑
                  </button>
                </div>
              ) : (
                <div className="flex between" style={{ gap: 10 }}>
                  <span className="small muted">绑定后可用 {oauth.name} 一键登录本账号</span>
                  <a className="btn btn-sm" href={`${API_BASE}/api/auth/oauth-bind-initiate`}>
                    去绑定
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 我的关注 */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16 }}>❤️ 我的关注</h3>
        {followings.length === 0 ? (
          <div className="muted small" style={{ padding: "8px 0" }}>
            还没有关注的主播，去 <Link to="/live-list">直播广场</Link> 逛逛
          </div>
        ) : (
          followings.map((f) => (
            <div className="list-row" key={f.userId}>
              <span className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>
                {f.avatarUrl ? <img src={f.avatarUrl} alt="" /> : f.name?.[0] ?? "U"}
              </span>
              <span className="grow">{f.name}</span>
              {f.live && <span className="badge badge-live">直播中</span>}
              {f.roomId && (
                <Link className="btn btn-sm" to={`/room/${f.roomId}`}>
                  进入直播间
                </Link>
              )}
              <button className="btn btn-sm btn-ghost" onClick={() => unfollow(f.userId)}>
                取关
              </button>
            </div>
          ))
        )}
      </div>

      {/* 钱包 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="flex between wrap" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>⭐ 我的星币</h3>
          <div className="flex">
            <Link className="btn btn-sm" to="/recharge">
              充值
            </Link>
            <Link className="btn btn-sm" to="/withdrawal">
              提现
            </Link>
          </div>
        </div>
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="stat-card" style={{ padding: 14 }}>
            <div className="muted small">当前余额</div>
            <div className="num" style={{ fontSize: 24 }}>{balance?.coins ?? 0}</div>
          </div>
          <div className="stat-card" style={{ padding: 14 }}>
            <div className="muted small">累计充值</div>
            <div className="num" style={{ fontSize: 24 }}>{balance?.totalRecharged ?? 0}</div>
          </div>
          <div className="stat-card" style={{ padding: 14 }}>
            <div className="muted small">累计提现</div>
            <div className="num" style={{ fontSize: 24 }}>{balance?.totalWithdrawn ?? 0}</div>
          </div>
        </div>
        <h4 className="muted small" style={{ margin: "0 0 6px", fontWeight: 500 }}>
          最近流水
        </h4>
        {txs.length === 0 ? (
          <div className="empty small" style={{ padding: "20px 0" }}>
            暂无交易记录
          </div>
        ) : (
          txs.map((t) => (
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
          ))
        )}
      </div>
    </div>
  );
}
