export interface GiftFx {
  id: string;
  emoji: string;
  fromName: string;
  giftName: string;
  count: number;
  /** 大额礼物触发全屏爆发 */
  big: boolean;
}

/** 礼物特效层：左上角横幅 + 大额礼物中央爆发 */
export default function GiftEffectLayer({ effects }: { effects: GiftFx[] }) {
  if (effects.length === 0) return null;
  return (
    <div className="gift-fx-layer">
      <div className="gift-banners">
        {effects.map((e) => (
          <div className="gift-banner" key={e.id}>
            <span className="gift-banner-emoji">{e.emoji}</span>
            <span className="gift-banner-text">
              <b>{e.fromName}</b> 送出 {e.giftName}
            </span>
            <span className="gift-banner-count">×{e.count}</span>
          </div>
        ))}
      </div>
      {effects
        .filter((e) => e.big)
        .map((e) => (
          <div className="gift-burst" key={`burst-${e.id}`}>
            <span className="gift-burst-emoji">{e.emoji}</span>
            <span className="gift-burst-name">
              {e.fromName} 送出 {e.giftName} ×{e.count}
            </span>
          </div>
        ))}
    </div>
  );
}
