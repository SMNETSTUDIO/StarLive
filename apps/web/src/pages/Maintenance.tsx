export default function Maintenance({ message }: { message?: string }) {
  return (
    <div className="status-page">
      <span className="status-icon">🔧</span>
      <h2>系统维护中</h2>
      <p className="muted" style={{ margin: 0, maxWidth: 420 }}>
        {message || "平台正在进行维护，请稍后再试"}
      </p>
    </div>
  );
}
