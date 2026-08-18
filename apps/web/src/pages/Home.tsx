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
        <div className="flex-col" style={{ gap: 24 }}>
          <div className="hero">
            <span className="hero-eyebrow">✦ 可自部署的直播互动平台</span>
            <h1 className="hero-title">
              直播互动，
              <br />
              <span className="grad">一站式体验。</span>
            </h1>
            <p className="hero-sub">
              高清直播、实时弹幕、礼物打赏、红包抽奖 —— 属于你自己的星币经济。
            </p>
            <div className="flex" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary btn-lg" to="/register">
                立即注册
              </Link>
              <Link className="btn btn-lg" to="/login">
                登录
              </Link>
              <a className="btn btn-lg btn-ghost" href="/api/auth/oauth-initiate">
                OAuth 登录
              </a>
            </div>
          </div>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card card-hover" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3 style={{ fontSize: 16 }}>{f.title}</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {f.desc}
                </p>
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
              <label className="switch" style={{ marginBottom: 18 }}>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span className="track" />
                公开房间
              </label>
              <div>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "创建中…" : "创建并开播"}
                </button>
              </div>
            </form>
          </div>
          <div className="card">
            <div className="flex" style={{ gap: 14, marginBottom: 6 }}>
              <span
                className="avatar"
                style={{
                  width: 46,
                  height: 46,
                  fontSize: 20,
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  border: "none",
                }}
              >
                {user.name?.[0] ?? "U"}
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>欢迎，{user.name}</h2>
                <span className="small muted">开启今天的直播吧</span>
              </div>
            </div>
            <p className="muted small" style={{ margin: "10px 0 0" }}>
              通过 OBS 推流到你的房间，与观众互动，赚取星币收益。
            </p>
            <div className="quick-actions">
              <Link className="quick-action" to="/dashboard">
                <span className="qa-icon">📺</span>
                我的房间
              </Link>
              <Link className="quick-action" to="/recharge">
                <span className="qa-icon">⭐</span>
                充值星币
              </Link>
              <Link className="quick-action" to="/withdrawal">
                <span className="qa-icon">💸</span>
                提现
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
