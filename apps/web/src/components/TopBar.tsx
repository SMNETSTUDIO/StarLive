import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function TopBar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="topbar">
      <Link to="/" className="logo">
        ⭐ StarLive 星播平台
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>
          首页
        </NavLink>
        <NavLink to="/live-list">直播广场</NavLink>
        {user && <NavLink to="/dashboard">我的房间</NavLink>}
        <NavLink to="/recharge">充值</NavLink>
        <NavLink to="/withdrawal">提现</NavLink>
        {isAdmin && <NavLink to="/admin">管理后台</NavLink>}
      </nav>
      <div className="flex">
        {user ? (
          <>
            <span className="avatar">{user.name?.[0] ?? "U"}</span>
            <span className="small">{user.name}</span>
            <button className="btn btn-sm btn-ghost" onClick={onLogout}>
              退出
            </button>
          </>
        ) : (
          <>
            <Link className="btn btn-sm" to="/login">
              登录
            </Link>
            <Link className="btn btn-sm btn-primary" to="/register">
              注册
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
