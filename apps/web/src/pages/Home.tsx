import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { post } from "../lib/api";

const FEATURES = [
  { icon: "🎬", title: "高清直播", desc: "自建推流分发，HLS 低延迟播放" },
  { icon: "💬", title: "实时弹幕", desc: "WebSocket 全房广播，畅聊无延迟" },
  { icon: "🎁", title: "礼物打赏", desc: "星币打赏，全房特效同步" },
  { icon: "🧧", title: "红包抽奖", desc: "红包雨 + 幸运转盘，活跃互动" },
  { icon: "💰", title: "星币经济", desc: "多支付网关充值，收益可提现" },
  { icon: "🛡️", title: "内容治理", desc: "房管 + 敏感词 + 举报，安全可控" },
];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const room = await post<{ id: string }>("/room/create", {
        title,
        isPublic,
        password: password || undefined,
        category: category || undefined,
      });
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      {!user ? (
        <div className="flex-col" style={{ gap: 32 }}>
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <h1 style={{ fontSize: 34 }}>⭐ StarLive 星播平台</h1>
            <p className="muted" style={{ maxWidth: 520, margin: "0 auto 24px" }}>
              可自部署的直播互动平台，直播、弹幕、礼物、红包、抽奖一站式体验。
            </p>
            <div className="flex" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" to="/register">
                立即注册
              </Link>
              <Link className="btn" to="/login">
                登录
              </Link>
              <a className="btn" href="/api/auth/oauth-initiate">
                OAuth 登录
              </a>
            </div>
          </div>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <div style={{ fontSize: 28 }}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p className="muted small">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          <div className="card">
            <h2>创建直播间</h2>
            <form onSubmit={onCreate}>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="field">
                <label>房间标题</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入直播标题…"
                  required
                />
              </div>
              <div className="field">
                <label>分类</label>
                <input
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="如：游戏 / 音乐 / 闲聊"
                />
              </div>
              <div className="field">
                <label>房间密码（可选，私密房间）</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="留空为公开"
                />
              </div>
              <label className="flex" style={{ marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                公开房间
              </label>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? "创建中…" : "创建并开播"}
              </button>
            </form>
          </div>
          <div className="card">
            <h2>欢迎，{user.name}</h2>
            <p className="muted">通过 OBS 推流到你的房间，与观众互动，赚取星币收益。</p>
            <div className="flex wrap">
              <Link className="btn" to="/dashboard">
                管理我的房间
              </Link>
              <Link className="btn" to="/recharge">
                充值星币
              </Link>
              <Link className="btn" to="/withdrawal">
                提现
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
