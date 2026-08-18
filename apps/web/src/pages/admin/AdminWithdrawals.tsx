import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  createdAt: number;
}

const STATUS_TABS = [
  { label: "⏳ 待处理", value: "pending" },
  { label: "🔄 处理中", value: "processing" },
  { label: "✅ 已完成", value: "completed" },
  { label: "❌ 已拒绝", value: "rejected" },
];

export default function AdminWithdrawals() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<Withdrawal[]>([]);

  const load = () =>
    get<Withdrawal[]>(`/admin/withdrawals?status=${status}`).then(setItems).catch(() => undefined);

  useEffect(() => {
    void load();
  }, [status]);

  const process = async (id: string, action: "approve" | "reject") => {
    await post("/admin/withdrawal-process", { id, action });
    load();
  };

  return (
    <div>
      <h2>提现管理</h2>
      <div className="chips" style={{ marginBottom: 16 }}>
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
      <table className="table">
        <thead>
          <tr>
            <th>单号</th>
            <th>用户</th>
            <th>金额</th>
            <th>手续费</th>
            <th>实付</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={7}>
                该状态下暂无提现申请
              </td>
            </tr>
          )}
          {items.map((w) => (
            <tr key={w.id}>
              <td>{w.id}</td>
              <td>{w.userId}</td>
              <td>{w.amount}</td>
              <td>{w.fee}</td>
              <td>{w.net}</td>
              <td>{new Date(w.createdAt).toLocaleString()}</td>
              <td>
                {w.status === "pending" && (
                  <div className="flex">
                    <button className="btn btn-sm btn-primary" onClick={() => process(w.id, "approve")}>
                      通过
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => process(w.id, "reject")}>
                      拒绝
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
