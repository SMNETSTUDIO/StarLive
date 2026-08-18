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
      <div style={{ maxWidth: 480, margin: "24px auto 0" }}>
        <div className="balance-card green">
          <div className="flex between">
            <div>
              <span className="small" style={{ opacity: 0.85 }}>
                可提现余额
              </span>
              <div className="balance-num">
                💰 {balance?.coins ?? 0}
                <span className="balance-unit">SC</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="small" style={{ opacity: 0.85 }}>
                累计已提现
              </span>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {balance?.totalWithdrawn ?? 0}
                <span className="balance-unit">SC</span>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
        {msg && <div className="alert alert-success" style={{ marginTop: 16 }}>{msg}</div>}

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16 }}>🏦 收款账户</h3>
          <div className="field">
            <label>收款人 ID</label>
            <input
              className="input"
              placeholder="支付平台收款账号"
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
            />
          </div>
          <div className="field">
            <label>收款人名称</label>
            <input
              className="input"
              placeholder="真实姓名或账户名"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
            />
          </div>
          <button className="btn" style={{ width: "100%" }} onClick={onSave}>
            保存收款账户
          </button>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16 }}>💸 申请提现</h3>
          <div className="field">
            <label>提现金额（星币）</label>
            <input
              className="input"
              type="number"
              placeholder="最低 10 SC"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <p className="small muted" style={{ margin: "0 0 14px" }}>
            最低提现 10 SC，平台收取 20% 手续费，审核通过后到账
          </p>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={onWithdraw}>
            申请提现
          </button>
        </div>
      </div>
    </div>
  );
}
