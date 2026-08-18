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

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    get<Order[]>("/admin/orders").then(setOrders).catch(() => undefined);
  }, []);

  return (
    <div>
      <h2>订单管理</h2>
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
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.userId}</td>
              <td>{o.amount}</td>
              <td>{o.coins}</td>
              <td>{o.provider}</td>
              <td>
                <span className={`badge ${o.status === "paid" ? "badge-ok" : "badge-warn"}`}>{o.status}</span>
              </td>
              <td>{new Date(o.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
