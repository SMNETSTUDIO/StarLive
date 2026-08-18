import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { get } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauth, setOauth] = useState<{ enabled: boolean; name: string } | null>(null);

  useEffect(() => {
    get<{ enabled: boolean; name: string }>("/auth/oauth-status")
      .then(setOauth)
      .catch(() => undefined);
    // OAuth 回调失败时带回的错误信息
    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(account, password);
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
          <span className="auth-mark">⭐</span>
          <h2>欢迎回来</h2>
          <p>登录 StarLive，继续你的直播之旅</p>
        </div>
        <div className="card">
          <form onSubmit={onSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label>用户名 / 邮箱</label>
            <input
              className="input"
              name="username"
              autoComplete="username"
              spellCheck={false}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
          </form>
          {oauth?.enabled && (
            <>
              <div className="flex" style={{ gap: 10, margin: "16px 0" }}>
                <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span className="small muted">或</span>
                <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <a className="btn" style={{ width: "100%" }} href="/api/auth/oauth-initiate?redirect=/">
                使用 {oauth.name} 登录
              </a>
            </>
          )}
          <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
            还没有账号？<Link to="/register">立即注册</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
