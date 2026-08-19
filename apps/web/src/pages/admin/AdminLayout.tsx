import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const LINKS = [
  { to: "/admin", label: "📊 概览", end: true },
  { to: "/admin/users", label: "👤 用户管理" },
  { to: "/admin/rooms", label: "📺 房间管理" },
  { to: "/admin/withdrawals", label: "💸 提现管理" },
  { to: "/admin/orders", label: "🧾 订单管理" },
  { to: "/admin/recordings", label: "🎞️ 录播管理" },
  { to: "/admin/rbac", label: "🔐 权限管理" },
  { to: "/admin/moderation", label: "🛡️ 内容治理" },
  { to: "/admin/audit", label: "📋 操作日志" },
  { to: "/admin/settings", label: "⚙️ 系统设置" },
];

export default function AdminLayout() {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // 会话加载中先不渲染，避免误闪 403
  if (loading) {
    return <div className="empty container">加载中…</div>;
  }
  // 未登录 → 登录页；已登录但无管理权限 → 403 提示（API 侧本就有守卫，这里挡住 UI）
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="status-page">
        <span className="status-icon">🚫</span>
        <h2>无权访问</h2>
        <p className="muted">该页面仅限管理员使用</p>
        <Link className="btn btn-primary" to="/">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            {l.label}
          </NavLink>
        ))}
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
