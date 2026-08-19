export type GiftTier = "float" | "drive" | "rocket" | "epic";

export interface GiftFx {
  id: string;
  emoji: string;
  fromName: string;
  giftName: string;
  count: number;
  /** 特效等级：按总价值分级（float 漂浮 / drive 横穿 / rocket 升空 / epic 全屏庆典） */
  tier: GiftTier;
}

/** 按总价值(SC)计算特效等级 */
export function giftTier(totalValue: number): GiftTier {
  if (totalValue >= 1314) return "epic";
  if (totalValue >= 520) return "rocket";
  if (totalValue >= 66) return "drive";
  return "float";
}

/** 特效持续时间（与 CSS 动画时长匹配，Room 按此清理） */
export function giftFxDuration(tier: GiftTier): number {
  return tier === "epic" ? 5200 : tier === "rocket" ? 4300 : 3900;
}

/** 伪随机但稳定：同一特效重渲染时粒子位置不跳变 */
function seeded(id: string, i: number): number {
  let h = 0;
  const s = `${id}:${i}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return (h % 1000) / 1000;
}

function FloatFx({ fx }: { fx: GiftFx }) {
  const n = Math.min(4 + fx.count * 2, 14);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="fx-float"
          style={{
            left: `${8 + seeded(fx.id, i) * 84}%`,
            animationDelay: `${seeded(fx.id, i + 100) * 1.2}s`,
            fontSize: `${22 + seeded(fx.id, i + 200) * 18}px`,
            ["--sway" as string]: `${(seeded(fx.id, i + 300) - 0.5) * 120}px`,
          }}
        >
          {fx.emoji}
        </span>
      ))}
    </>
  );
}

function DriveFx({ fx }: { fx: GiftFx }) {
  return (
    <div className="fx-drive">
      <span className="fx-drive-emoji">{fx.emoji}</span>
      <span className="fx-drive-lines" />
    </div>
  );
}

function RocketFx({ fx }: { fx: GiftFx }) {
  return (
    <>
      <div className="fx-rocket">
        <span className="fx-rocket-emoji">{fx.emoji}</span>
        <span className="fx-rocket-flame">🔥</span>
      </div>
      <div className="fx-shockwave" />
    </>
  );
}

function EpicFx({ fx }: { fx: GiftFx }) {
  return (
    <>
      <div className="fx-epic-glow" />
      <div className="fx-epic-center">
        <span className="fx-epic-emoji">{fx.emoji}</span>
        <span className="fx-epic-name">
          {fx.fromName} 送出 {fx.giftName} ×{fx.count}
        </span>
      </div>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="fx-star"
          style={{
            left: `${seeded(fx.id, i) * 100}%`,
            animationDelay: `${seeded(fx.id, i + 50) * 2.2}s`,
            fontSize: `${12 + seeded(fx.id, i + 90) * 16}px`,
          }}
        >
          {i % 3 === 0 ? "✨" : i % 3 === 1 ? "⭐" : "💛"}
        </span>
      ))}
    </>
  );
}

/** 礼物特效层：横幅 + 分级动画（漂浮/横穿/升空/全屏庆典） */
export default function GiftEffectLayer({ effects }: { effects: GiftFx[] }) {
  if (effects.length === 0) return null;
  const shaking = effects.some((e) => e.tier === "rocket" || e.tier === "epic");
  return (
    <div className={`gift-fx-layer${shaking ? " fx-shake" : ""}`}>
      <div className="gift-banners">
        {effects.map((e) => (
          <div className={`gift-banner tier-${e.tier}`} key={e.id}>
            <span className="gift-banner-emoji">{e.emoji}</span>
            <span className="gift-banner-text">
              <b>{e.fromName}</b> 送出 {e.giftName}
            </span>
            <span className="gift-banner-count">×{e.count}</span>
          </div>
        ))}
      </div>
      {effects.map((e) => {
        switch (e.tier) {
          case "float":
            return <FloatFx fx={e} key={`fx-${e.id}`} />;
          case "drive":
            return <DriveFx fx={e} key={`fx-${e.id}`} />;
          case "rocket":
            return <RocketFx fx={e} key={`fx-${e.id}`} />;
          case "epic":
            return <EpicFx fx={e} key={`fx-${e.id}`} />;
        }
      })}
    </div>
  );
}
