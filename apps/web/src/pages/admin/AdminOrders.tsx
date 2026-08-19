import { useEffect, useState } from "react";
import Pagination, { pageCountOf, paginate } from "../../components/Pagination";
import { get, post } from "../../lib/api";
import { downloadCsv } from "../../lib/csv";

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

const PAGE_SIZE = 20;

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const load = () => get<Order[]>("/admin/orders").then(setOrders).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const complete = async (orderId: string) => {
    if (!confirm(`确认手动补单 ${orderId}？将直接为用户入账星币（用于支付回调丢失的情况）`)) return;
    setError("");
    try {
      await post("/admin/order-complete", { orderId });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const kw = keyword.trim().toLowerCase();
  const shown = orders
    .filter((o) => !status || o.status === status)
    .filter((o) => !kw || o.id.toLowerCase().includes(kw) || o.userId.toLowerCase().includes(kw))
    .sort((a, b) => b.createdAt - a.createdAt);

  const paidTotal = shown.filter((o) => o.status === "paid").reduce((s, o) => s + o.amount, 0);
  const pageCount = pageCountOf(shown.length, PAGE_SIZE);
  const paged = paginate(shown, Math.min(page, pageCount), PAGE_SIZE);

  return (
    <div>
      <div className="flex between wrap" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>订单管理</h2>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="🔍 搜索订单号 / 用户 ID…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="flex between wrap" style={{ marginBottom: 16 }}>
        <div className="chips">
          {STATUS_TABS.map((s) => (
            <button
              key={s.value}
              className={`chip${status === s.value ? " active" : ""}`}
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex">
          <span className="muted small">
            {shown.length} 笔 · 已支付合计 ¥{paidTotal.toFixed(2)}
          </span>
          <button
            className="btn btn-sm"
            disabled={shown.length === 0}
            onClick={() =>
              downloadCsv(
                `orders_${new Date().toISOString().slice(0, 10)}.csv`,
                ["订单号", "用户ID", "金额(元)", "星币", "网关", "状态", "创建时间"],
                shown.map((o) => [
                  o.id,
                  o.userId,
                  o.amount,
                  o.coins,
                  o.provider,
                  o.status === "paid" ? "已支付" : "待支付",
                  new Date(o.createdAt).toLocaleString("zh-CN", { hour12: false }),
                ]),
              )
            }
          >
            ⬇︎ 导出 CSV
          </button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
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
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={8}>
                暂无订单
              </td>
            </tr>
          )}
          {paged.map((o) => (
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
              <td>
                {o.status === "pending" && (
                  <button className="btn btn-sm" onClick={() => complete(o.id)}>
                    补单
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Pagination
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={shown.length}
        onChange={setPage}
      />
    </div>
  );
}
