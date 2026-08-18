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
      <div className="topbar-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">⭐</span>
          StarLive
          <span className="logo-sub">星播平台</span>
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
              <Link to="/profile" className="flex" style={{ gap: 8, color: "inherit" }} title="个人中心">
                <span className="avatar">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name?.[0] ?? "U"}
                </span>
                <span className="small">{user.name}</span>
              </Link>
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
      </div>
    </header>
  );
}
