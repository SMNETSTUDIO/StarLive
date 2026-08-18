import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface Features {
  maintenanceEnabled: boolean;
  maintenanceMessage?: string;
  registrationEnabled: boolean;
  recordingEnabled: boolean;
  transcodingEnabled: boolean;
  lotteryEnabled: boolean;
  publicListEnabled: boolean;
}

const PAY_PROVIDERS = [
  { value: "epay", label: "易支付" },
  { value: "alipay", label: "支付宝" },
  { value: "stripe", label: "Stripe" },
] as const;

const PAY_FIELD_LABELS: Record<string, Record<string, string>> = {
  epay: { pid: "商户 PID", key: "商户密钥", gateway: "网关地址（https://…）" },
  alipay: {
    appId: "AppID",
    privateKey: "应用私钥（RSA2，可粘贴无头尾 base64）",
    alipayPublicKey: "支付宝公钥",
    gateway: "网关（默认 openapi.alipay.com）",
  },
  stripe: { secretKey: "Secret Key", webhookSecret: "Webhook Secret", currency: "计费货币（默认 usd）" },
};

export default function AdminSettings() {
  const [features, setFeatures] = useState<Features | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [msg, setMsg] = useState("");
  const [payProvider, setPayProvider] = useState<string>("epay");
  const [payConfig, setPayConfig] = useState<Record<string, string>>({});
  const [gateways, setGateways] = useState<
    { provider: string; configured: boolean; enabled: boolean }[]
  >([]);

  const loadGateways = () => {
    get<{ provider: string; configured: boolean; enabled: boolean }[]>("/admin/payment-gateways")
      .then(setGateways)
      .catch(() => undefined);
  };

  const load = () => {
    get<Features>("/admin/features").then(setFeatures).catch(() => undefined);
    get<Record<string, string>>("/admin/config").then(setConfig).catch(() => undefined);
    loadGateways();
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    get<{ config: Record<string, string> }>(`/admin/payment-config?provider=${payProvider}`)
      .then((r) => setPayConfig(r.config))
      .catch(() => setPayConfig({}));
  }, [payProvider]);

  const savePayConfig = async () => {
    try {
      const r = await post<{ config: Record<string, string> }>("/admin/payment-config-update", {
        provider: payProvider,
        config: payConfig,
      });
      setPayConfig(r.config);
      loadGateways();
      setMsg("支付网关配置已保存");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const toggle = async (key: keyof Features) => {
    if (!features) return;
    const next = { ...features, [key]: !features[key] };
    setFeatures(next);
    await post("/admin/features-update", { [key]: next[key] });
  };

  const saveConfig = async () => {
    await post("/admin/config-update", config);
    setMsg("配置已保存");
  };

  const saveAnn = async () => {
    await post("/admin/announcement", { title: annTitle, content: annContent });
    setMsg("公告已发布");
  };

  return (
    <div>
      <h2>系统设置</h2>
      {msg && <div className="alert alert-success">{msg}</div>}
      <div className="grid grid-2">
        <div className="card">
          <h3>功能开关</h3>
          {features &&
            (
              [
                ["maintenanceEnabled", "维护模式"],
                ["registrationEnabled", "开放注册"],
                ["recordingEnabled", "录播"],
                ["transcodingEnabled", "转码"],
                ["lotteryEnabled", "抽奖"],
                ["publicListEnabled", "直播广场"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex between" key={key} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{label}</span>
                <input type="checkbox" checked={features[key]} onChange={() => toggle(key)} />
              </label>
            ))}
        </div>
        <div className="card">
          <h3>经济配置</h3>
          <div className="field">
            <label>提现手续费（%）</label>
            <input
              className="input"
              value={config.withdrawal_fee ?? ""}
              onChange={(e) => setConfig({ ...config, withdrawal_fee: e.target.value })}
            />
          </div>
          <div className="field">
            <label>最低提现（星币）</label>
            <input
              className="input"
              value={config.min_withdrawal ?? ""}
              onChange={(e) => setConfig({ ...config, min_withdrawal: e.target.value })}
            />
          </div>
          <div className="field">
            <label>充值比例（1 元 = N 星币）</label>
            <input
              className="input"
              value={config.gift_coin_ratio ?? ""}
              onChange={(e) => setConfig({ ...config, gift_coin_ratio: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={saveConfig}>
            保存配置
          </button>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h3>支付网关</h3>
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            各网关相互独立，可同时启用任意多个；配置保存在数据库并即时生效，优先于环境变量；
            密钥回显为掩码，留空提交表示清除（回退环境变量）。
          </p>
          {gateways.length > 0 && (
            <div className="flex wrap" style={{ gap: 6, marginBottom: 14 }}>
              {gateways.map((g) => (
                <span
                  key={g.provider}
                  className={`badge ${g.configured && g.enabled ? "badge-ok" : g.configured ? "badge-warn" : ""}`}
                >
                  {PAY_PROVIDERS.find((p) => p.value === g.provider)?.label ??
                    (g.provider === "mock" ? "沙箱" : g.provider)}{" "}
                  {g.configured && g.enabled ? "启用中" : g.configured ? "已停用" : "未配置"}
                </span>
              ))}
            </div>
          )}
          <div className="field" style={{ maxWidth: 260 }}>
            <label>网关</label>
            <select
              className="select"
              value={payProvider}
              onChange={(e) => setPayProvider(e.target.value)}
            >
              {PAY_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-3">
            {Object.entries(PAY_FIELD_LABELS[payProvider] ?? {}).map(([field, label]) => (
              <div className="field" key={field}>
                <label>{label}</label>
                <input
                  className="input"
                  value={payConfig[field] ?? ""}
                  spellCheck={false}
                  onChange={(e) => setPayConfig({ ...payConfig, [field]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <label className="switch" style={{ margin: "4px 0 16px" }}>
            <input
              type="checkbox"
              checked={payConfig.enabled !== "false"}
              onChange={(e) =>
                setPayConfig({ ...payConfig, enabled: e.target.checked ? "true" : "false" })
              }
            />
            <span className="track" />
            启用该网关（停用后不在充值页展示，已有订单的回调/查单不受影响）
          </label>
          <button className="btn btn-primary" onClick={savePayConfig}>
            保存网关配置
          </button>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h3>系统公告</h3>
          <div className="field">
            <label>标题</label>
            <input className="input" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>内容</label>
            <textarea className="input" value={annContent} onChange={(e) => setAnnContent(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveAnn}>
            发布公告
          </button>
        </div>
      </div>
    </div>
  );
}
