import { useEffect, useState } from "react";
import { get, post } from "../lib/api";

interface Balance {
  coins: number;
  totalRecharged: number;
  totalWithdrawn: number;
}

export default function Withdrawal() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [payeeId, setPayeeId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [amount, setAmount] = useState(0);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    get<Balance>("/balance").then(setBalance).catch(() => undefined);
    get<{ payeeId?: string; payeeName?: string }>("/withdrawal/distribute")
      .then((d) => {
        setPayeeId(d?.payeeId ?? "");
        setPayeeName(d?.payeeName ?? "");
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const onSave = async () => {
    setError("");
    try {
      await post("/withdrawal/distribute", { payeeId, payeeName });
      setMsg("收款账户已保存");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onWithdraw = async () => {
    setError("");
    setMsg("");
    try {
      const r = await post<{ id: string }>("/withdrawal/request", { amount });
      setMsg(`提现申请已提交（单号 ${r.id}），等待审核`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
        <h2>提现</h2>
        <p className="muted">
          可用余额：{balance?.coins ?? 0} SC · 已提现：{balance?.totalWithdrawn ?? 0} SC
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
        <div className="field">
          <label>收款人 ID</label>
          <input className="input" value={payeeId} onChange={(e) => setPayeeId(e.target.value)} />
        </div>
        <div className="field">
          <label>收款人名称</label>
          <input className="input" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
        </div>
        <button className="btn" onClick={onSave}>
          保存收款账户
        </button>
        <hr style={{ borderColor: "var(--border)", margin: "20px 0" }} />
        <div className="field">
          <label>提现金额（星币，最低 10，收取 20% 手续费）</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary" onClick={onWithdraw}>
          申请提现
        </button>
      </div>
    </div>
  );
}
