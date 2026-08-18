import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container">
      <div className="card" style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48 }}>404</div>
        <h2>页面不存在</h2>
        <Link className="btn btn-primary" to="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}
