import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import LiveThumb from "../components/LiveThumb";
import { useAuth } from "../context/AuthContext";
import { get, post } from "../lib/api";

interface LiveRoom {
  id: string;
  title: string;
  category: string;
  viewerCount: number;
  status: string;
  playbackUrl?: string;
}

/** 正在直播区块：有开播房间时才渲染 */
function LiveNow() {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);

  useEffect(() => {
    get<LiveRoom[]>("/room/list")
      .then((r) => setRooms(r.filter((x) => x.status === "active").slice(0, 3)))
      .catch(() => undefined);
  }, []);

  if (rooms.length === 0) return null;

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🔴 正在直播</h2>
        <Link className="small" to="/live-list">
          全部直播 ›
        </Link>
      </div>
      <div className="grid grid-3">
        {rooms.map((r) => (
          <Link
            to={`/room/${r.id}`}
            key={r.id}
            className="card card-hover"
            style={{ color: "inherit" }}
          >
            <LiveThumb roomId={r.id} playbackUrl={r.playbackUrl} />
            <div className="flex between" style={{ marginTop: 14 }}>
              <span className="badge badge-live">直播中</span>
              <span className="badge">👀 {r.viewerCount}</span>
            </div>
            <h3 style={{ margin: "10px 0 2px", fontSize: 16 }}>{r.title}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {r.category || "未分类"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

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
  const [oauth, setOauth] = useState<{ enabled: boolean; name: string } | null>(null);

  useEffect(() => {
    if (user) return;
    get<{ enabled: boolean; name: string }>("/auth/oauth-status")
      .then(setOauth)
      .catch(() => undefined);
  }, [user]);

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
            <span className="hero-eyebrow">✦ StarLive · 开源自部署直播平台</span>
            <h1 className="hero-title">
              自己的直播间，
              <br />
              <span className="grad">自己说了算。</span>
            </h1>
            <p className="hero-sub">
              推流、弹幕、礼物、红包、提现——整套星币经济，都跑在你自己的服务器上。
            </p>
            <div className="flex" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary btn-lg" to="/register">
                立即注册
              </Link>
              <Link className="btn btn-lg" to="/login">
                登录
              </Link>
              {oauth?.enabled && (
                <a className="btn btn-lg btn-ghost" href="/api/auth/oauth-initiate?redirect=/">
                  {oauth.name} 登录
                </a>
              )}
            </div>
          </div>
          <LiveNow />
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
        <div className="flex-col" style={{ gap: 16 }}>
        <LiveNow />
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

        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>🎬 开播三步走</h3>
          <div className="grid grid-3">
            <div className="step-card">
              <span className="step-num">1</span>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>创建直播间</div>
              <p className="muted small" style={{ margin: 0 }}>
                填写标题和分类，可设密码开私密房
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">2</span>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>复制推流密钥</div>
              <p className="muted small" style={{ margin: 0 }}>
                进入房间页，一键复制 OBS 串流密钥
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">3</span>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>OBS 开始推流</div>
              <p className="muted small" style={{ margin: 0 }}>
                在 OBS 设置中填写直播流服务器，即刻开播
              </p>
            </div>
          </div>
        </div>

        <Link to="/live-list" className="card card-hover flex between" style={{ color: "inherit" }}>
          <div className="flex" style={{ gap: 14 }}>
            <span className="feature-icon" style={{ marginBottom: 0 }}>🔥</span>
            <div>
              <div style={{ fontWeight: 600 }}>直播广场</div>
              <span className="muted small">看看现在谁在直播，发弹幕抢红包</span>
            </div>
          </div>
          <span className="muted" style={{ fontSize: 20 }}>›</span>
        </Link>
        </div>
      )}
    </div>
  );
}
