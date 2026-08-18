export default function Banned() {
  return (
    <div className="container">
      <div className="card" style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2>账号已被封禁</h2>
        <p className="muted">如有疑问请联系管理员。</p>
      </div>
    </div>
  );
}
