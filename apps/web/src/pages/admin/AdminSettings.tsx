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

export default function AdminSettings() {
  const [features, setFeatures] = useState<Features | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    get<Features>("/admin/features").then(setFeatures).catch(() => undefined);
    get<Record<string, string>>("/admin/config").then(setConfig).catch(() => undefined);
  };

  useEffect(() => {
    void load();
  }, []);

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
