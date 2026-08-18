import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { get } from "../lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [regOpen, setRegOpen] = useState(true);

  useEffect(() => {
    get<{ registrationEnabled: boolean }>("/system/features")
      .then((f) => setRegOpen(f.registrationEnabled !== false))
      .catch(() => undefined);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(username, password, email || undefined);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="auth-wrap">
        <div className="auth-head">
          <span className="auth-mark">✨</span>
          <h2>创建账号</h2>
          <p>加入 StarLive，开启你的直播之旅</p>
        </div>
        {!regOpen ? (
          <div className="card" style={{ textAlign: "center", padding: "36px 24px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚪</div>
            <h3 style={{ marginBottom: 6 }}>注册暂未开放</h3>
            <p className="muted small" style={{ margin: "0 0 18px" }}>
              管理员已关闭新用户注册，如需账号请联系管理员
            </p>
            <Link className="btn" to="/login">
              已有账号？去登录
            </Link>
          </div>
        ) : (
        <div className="card">
          <form onSubmit={onSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label>用户名（2-20 位）</label>
            <input
              className="input"
              name="username"
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>邮箱（可选）</label>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>密码（至少 6 位）</label>
            <input
              className="input"
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "注册中…" : "注册"}
          </button>
          </form>
          <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
            已有账号？<Link to="/login">登录</Link>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
