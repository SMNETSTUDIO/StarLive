import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="logo-mark" style={{ width: 24, height: 24, fontSize: 13 }}>
            ⭐
          </span>
          <span>StarLive</span>
          <span className="muted small" style={{ marginLeft: 6 }}>
            星播平台
          </span>
        </div>
        <nav className="footer-links">
          <Link to="/live-list">直播广场</Link>
          <Link to="/recharge">充值</Link>
          <Link to="/withdrawal">提现</Link>
          <a href="https://github.com/SMNETSTUDIO/StarLive" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <span className="muted small">
          自部署直播互动平台 · 星币经济 · © {new Date().getFullYear()} StarLive
        </span>
      </div>
    </footer>
  );
}
