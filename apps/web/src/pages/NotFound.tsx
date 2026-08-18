import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="status-page">
      <div className="status-code">404</div>
      <h2>页面不存在</h2>
      <p className="muted" style={{ margin: "0 0 24px" }}>
        你要找的页面可能已被移动或删除
      </p>
      <Link className="btn btn-primary" to="/">
        返回首页
      </Link>
    </div>
  );
}
