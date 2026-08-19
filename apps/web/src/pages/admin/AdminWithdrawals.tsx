import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";
import { batchResultText, useSelection, type BatchResult } from "../../lib/use-selection";

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
  const [batchMsg, setBatchMsg] = useState("");
  const { selected, toggle, toggleAll, clear, allChecked } = useSelection();

  const load = () =>
    get<Withdrawal[]>(`/admin/withdrawals?status=${status}`).then(setItems).catch(() => undefined);

  useEffect(() => {
    clear();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const process = async (id: string, action: "approve" | "reject") => {
    await post("/admin/withdrawal-process", { id, action });
    load();
  };

  const batch = async (action: "approve" | "reject") => {
    const label = action === "approve" ? "通过" : "拒绝";
    if (!confirm(`确认批量「${label}」选中的 ${selected.size} 笔提现？`)) return;
    try {
      const r = await post<BatchResult>("/admin/withdrawals-batch", { ids: [...selected], action });
      setBatchMsg(batchResultText(r));
      clear();
      load();
    } catch (e) {
      setBatchMsg((e as Error).message);
    }
  };

  const pending = status === "pending";
  const ids = items.map((w) => w.id);

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
      {batchMsg && <div className="alert alert-success">{batchMsg}</div>}
      {pending && selected.size > 0 && (
        <div className="batch-bar">
          <span>已选 {selected.size} 笔</span>
          <button className="btn btn-sm btn-primary" onClick={() => batch("approve")}>
            批量通过
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => batch("reject")}>
            批量拒绝
          </button>
          <button className="btn btn-sm btn-ghost" onClick={clear}>
            取消选择
          </button>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            {pending && (
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={allChecked(ids)}
                  onChange={() => toggleAll(ids)}
                  title="全选"
                />
              </th>
            )}
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
              <td className="table-empty" colSpan={pending ? 8 : 7}>
                该状态下暂无提现申请
              </td>
            </tr>
          )}
          {items.map((w) => (
            <tr key={w.id}>
              {pending && (
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(w.id)}
                    onChange={() => toggle(w.id)}
                  />
                </td>
              )}
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
