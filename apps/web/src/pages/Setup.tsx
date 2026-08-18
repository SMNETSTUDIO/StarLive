import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { post } from "../lib/api";

/** 首次部署初始化：创建超级管理员 */
export default function Setup({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("/auth/setup", { username, password });
      await refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="auth-wrap" style={{ maxWidth: 420 }}>
        <div className="auth-head">
          <span className="auth-mark">⭐</span>
          <h2>欢迎使用 StarLive</h2>
          <p>系统尚未初始化，请创建超级管理员账号</p>
        </div>
        <div className="card">
          <form onSubmit={onSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label>管理员用户名</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-20 位字符"
              required
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
            />
          </div>
          <div className="field">
            <label>确认密码</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "初始化中…" : "创建管理员并完成初始化"}
          </button>
          </form>
          <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
            该账号拥有全部管理权限，请妥善保管密码
          </p>
        </div>
      </div>
    </div>
  );
}
