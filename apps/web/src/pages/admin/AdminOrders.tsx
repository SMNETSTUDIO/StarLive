import { useEffect, useState } from "react";
import { get } from "../../lib/api";

interface Order {
  id: string;
  userId: string;
  amount: number;
  coins: number;
  provider: string;
  status: string;
  createdAt: number;
}

const STATUS_TABS = [
  { label: "全部", value: "" },
  { label: "✅ 已支付", value: "paid" },
  { label: "⏳ 待支付", value: "pending" },
];

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    get<Order[]>("/admin/orders").then(setOrders).catch(() => undefined);
  }, []);

  const kw = keyword.trim().toLowerCase();
  const shown = orders
    .filter((o) => !status || o.status === status)
    .filter((o) => !kw || o.id.toLowerCase().includes(kw) || o.userId.toLowerCase().includes(kw))
    .sort((a, b) => b.createdAt - a.createdAt);

  const paidTotal = shown.filter((o) => o.status === "paid").reduce((s, o) => s + o.amount, 0);

  return (
    <div>
      <div className="flex between wrap" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>订单管理</h2>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="🔍 搜索订单号 / 用户 ID…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div className="flex between wrap" style={{ marginBottom: 16 }}>
        <div className="chips">
          {STATUS_TABS.map((s) => (
            <button
              key={s.value}
              className={`chip${status === s.value ? " active" : ""}`}
              onClick={() => setStatus(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="muted small">
          {shown.length} 笔 · 已支付合计 ¥{paidTotal.toFixed(2)}
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>用户</th>
            <th>金额(元)</th>
            <th>星币</th>
            <th>网关</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={7}>
                暂无订单
              </td>
            </tr>
          )}
          {shown.map((o) => (
            <tr key={o.id}>
              <td className="muted small">{o.id}</td>
              <td className="muted small">{o.userId}</td>
              <td>¥{o.amount}</td>
              <td>⭐ {o.coins}</td>
              <td>
                <span className="badge">{o.provider}</span>
              </td>
              <td>
                <span className={`badge ${o.status === "paid" ? "badge-ok" : "badge-warn"}`}>
                  {o.status === "paid" ? "已支付" : "待支付"}
                </span>
              </td>
              <td className="muted small">
                {new Date(o.createdAt).toLocaleString("zh-CN", { hour12: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
