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
  { value: "wechat", label: "微信支付" },
  { value: "stripe", label: "Stripe" },
  { value: "mock", label: "沙箱支付" },
] as const;

const PAY_FIELD_LABELS: Record<string, Record<string, string>> = {
  epay: { pid: "商户 PID", key: "商户密钥", gateway: "网关地址（https://…）" },
  alipay: {
    appId: "AppID",
    privateKey: "应用私钥（RSA2，可粘贴无头尾 base64）",
    alipayPublicKey: "支付宝公钥",
    gateway: "网关（默认 openapi.alipay.com）",
  },
  wechat: {
    appId: "AppID（公众号/服务号）",
    mchId: "商户号 MchID",
    apiV3Key: "APIv3 密钥（32 字符）",
    serialNo: "商户证书序列号",
    privateKey: "商户 API 私钥（可粘贴无头尾 base64）",
  },
  stripe: { secretKey: "Secret Key", webhookSecret: "Webhook Secret", currency: "计费货币（默认 usd）" },
  // 沙箱无凭据字段，仅启停开关
  mock: {},
};

/** 站点与 OAuth 登录：保存于 system:config，优先于环境变量，即时生效 */
const SITE_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "app_base_url", label: "站点对外地址", placeholder: "https://live.example.com（支付回调 / 播放地址基于此生成）" },
];

const OAUTH_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "oauth_provider_name", label: "提供方名称", placeholder: "如 LinuxDO（登录按钮展示名）" },
  { key: "oauth_client_id", label: "Client ID" },
  { key: "oauth_client_secret", label: "Client Secret" },
  { key: "oauth_auth_url", label: "授权地址 Auth URL", placeholder: "https://…/oauth2/authorize" },
  { key: "oauth_token_url", label: "令牌地址 Token URL", placeholder: "https://…/oauth2/token" },
  { key: "oauth_userinfo_url", label: "用户信息地址 UserInfo URL", placeholder: "https://…/api/user" },
  { key: "oauth_redirect_uri", label: "回调地址（留空自动推导）", placeholder: "{站点地址}/api/auth/oauth-callback" },
];

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
          <h3>站点与 OAuth 登录</h3>
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            保存在数据库并即时生效，优先于环境变量；留空表示回退环境变量默认值。
            除 REDIS_URL / JWT_SECRET / PORT 等启动必需项外，业务配置均可在此设置。
          </p>
          {SITE_FIELDS.map((f) => (
            <div className="field" key={f.key} style={{ maxWidth: 520 }}>
              <label>{f.label}</label>
              <input
                className="input"
                value={config[f.key] ?? ""}
                placeholder={f.placeholder}
                spellCheck={false}
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>OAuth 第三方登录</h4>
          <div className="grid grid-3">
            {OAUTH_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  className="input"
                  value={config[f.key] ?? ""}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={saveConfig}>
            保存站点与登录配置
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
