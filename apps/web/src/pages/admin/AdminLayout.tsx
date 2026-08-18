import { NavLink, Outlet } from "react-router-dom";

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
