import { useEffect, useState } from "react";
import { get, post } from "../lib/api";

const PACKAGES = [10, 50, 100, 500, 1000];

interface Balance {
  coins: number;
  totalRecharged: number;
  totalWithdrawn: number;
}

export default function Recharge() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [coins, setCoins] = useState(100);
  const [provider, setProvider] = useState("mock");
  const [providers, setProviders] = useState<string[]>(["mock"]);
  const [payResult, setPayResult] = useState<{ type: string; payload: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<Balance>("/balance").then(setBalance).catch(() => undefined);
    get<{ providers: string[] }>("/payment/providers")
      .then((r) => setProviders(r.providers))
      .catch(() => undefined);
  }, []);

  const onCreate = async () => {
    setError("");
    setPayResult(null);
    try {
      const r = await post<{ orderId: string; amount: number; payResult: { type: string; payload: string } }>(
        "/payment/create-order",
        { coins, provider },
      );
      setPayResult(r.payResult);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="container">
      <div style={{ maxWidth: 480, margin: "24px auto 0" }}>
        <div className="balance-card">
          <span className="small" style={{ opacity: 0.85 }}>
            当前余额
          </span>
          <div className="balance-num">
            ⭐ {balance?.coins ?? 0}
            <span className="balance-unit">SC</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 20 }}>充值星币</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label>充值金额（星币）</label>
          <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {PACKAGES.map((p) => (
              <div
                key={p}
                className={`gift-tile${coins === p ? " selected" : ""}`}
                onClick={() => setCoins(p)}
              >
                <div style={{ fontWeight: 600 }}>{p}</div>
                <div className="small muted">SC</div>
              </div>
            ))}
          </div>
          <input
            className="input"
            style={{ marginTop: 10 }}
            type="number"
            placeholder="自定义金额"
            value={coins}
            onChange={(e) => setCoins(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>支付方式</label>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={onCreate}>
          创建订单
        </button>
        {payResult && (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            {payResult.type === "form" ? (
              <div>
                <p>正在跳转支付…</p>
                <div dangerouslySetInnerHTML={{ __html: payResult.payload }} />
              </div>
            ) : payResult.type === "qrcode" ? (
              <div>
                <p>请扫码支付：</p>
                <img src={payResult.payload} alt="支付二维码" />
              </div>
            ) : (
              <div>
                <p>点击下方完成支付：</p>
                <a href={payResult.payload} target="_blank" rel="noreferrer" className="btn btn-primary">
                  去支付
                </a>
                <p className="small muted" style={{ marginTop: 8 }}>
                  （mock 网关为演示模式，支付后请刷新余额）
                </p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
