import { useEffect, useRef, useState } from "react";
import type { LotteryInfo } from "./LotteryPanel";
import type { RedpacketItem } from "./RedpacketPanel";

interface Props {
  redpackets: RedpacketItem[];
  lottery: LotteryInfo | null;
  isLoggedIn: boolean;
  isOwner: boolean;
  /** 抢红包，成功返回金额，失败抛错（已抢过/抢光/过期） */
  onClaim: (id: string) => Promise<number>;
  onJoin: (id: string) => Promise<void>;
  onDraw: (id: string) => Promise<void>;
}

type RpPhase = { kind: "open" } | { kind: "opening" } | { kind: "result"; amount: number } | { kind: "fail"; message: string };

/**
 * 直播间事件层：红包/抽奖挂件 + 弹窗。
 * 新事件（进房后新发的红包 / 新开的抽奖 / 开奖结果）自动弹出；
 * 进行中的事件在播放器右上角常驻挂件，随时可点开参与。
 * 渲染在播放器内部，全屏时同样可见可点。
 */
export default function LiveEvents({
  redpackets,
  lottery,
  isLoggedIn,
  isOwner,
  onClaim,
  onJoin,
  onDraw,
}: Props) {
  const [rpModal, setRpModal] = useState<RedpacketItem | null>(null);
  const [rpPhase, setRpPhase] = useState<RpPhase>({ kind: "open" });
  const [lotModal, setLotModal] = useState(false);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // 首帧只登记不弹窗（避免进房被弹窗伏击），之后的新事件自动弹出
  const seenRp = useRef<Set<string> | null>(null);
  const seenLottery = useRef<{ id: string; drawn: boolean } | null | undefined>(undefined);

  const activeRps = redpackets.filter((r) => !r.expired && !r.empty);
  const lotteryActive = lottery && !lottery.drawn;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 新红包自动弹出
  useEffect(() => {
    if (seenRp.current === null || seenRp.current === undefined) {
      seenRp.current = new Set(redpackets.map((r) => r.id));
      return;
    }
    for (const r of activeRps) {
      if (!seenRp.current.has(r.id)) {
        seenRp.current.add(r.id);
        setRpPhase({ kind: "open" });
        setRpModal(r);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redpackets]);

  // 新抽奖 / 开奖结果自动弹出
  useEffect(() => {
    if (seenLottery.current === undefined) {
      seenLottery.current = lottery ? { id: lottery.id, drawn: lottery.drawn } : null;
      return;
    }
    if (!lottery) {
      seenLottery.current = null;
      return;
    }
    const prev = seenLottery.current;
    if (!prev || prev.id !== lottery.id) {
      seenLottery.current = { id: lottery.id, drawn: lottery.drawn };
      if (!lottery.drawn) setLotModal(true);
      return;
    }
    if (!prev.drawn && lottery.drawn) {
      seenLottery.current = { id: lottery.id, drawn: true };
      setLotModal(true); // 开奖结果
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lottery]);

  const openRp = () => {
    if (activeRps.length === 0) return;
    setRpPhase({ kind: "open" });
    setRpModal(activeRps[0]);
  };

  const claim = async () => {
    if (!rpModal) return;
    setRpPhase({ kind: "opening" });
    try {
      const amount = await onClaim(rpModal.id);
      setRpPhase({ kind: "result", amount });
    } catch (e) {
      setRpPhase({ kind: "fail", message: (e as Error).message });
    }
  };

  const join = async () => {
    if (!lottery) return;
    setBusy(true);
    try {
      await onJoin(lottery.id);
      setJoined((s) => new Set(s).add(lottery.id));
    } catch (e) {
      const msg = (e as Error).message;
      // 重复参与视为已参与
      if (/已参与|重复/.test(msg)) setJoined((s) => new Set(s).add(lottery.id));
    } finally {
      setBusy(false);
    }
  };

  const remaining = lottery ? Math.max(0, Math.ceil((lottery.endsAt - now) / 1000)) : 0;
  const hasJoined = lottery ? joined.has(lottery.id) : false;

  return (
    <>
      {/* 挂件 */}
      <div className="live-pendants">
        {activeRps.length > 0 && (
          <button className="pendant pendant-rp" onClick={openRp} title="抢红包">
            🧧
            {activeRps.length > 1 && <i className="pendant-badge">{activeRps.length}</i>}
          </button>
        )}
        {lotteryActive && (
          <button className="pendant pendant-lot" onClick={() => setLotModal(true)} title="参与抽奖">
            🎰
            <i className="pendant-timer">{remaining}s</i>
          </button>
        )}
      </div>

      {/* 红包弹窗 */}
      {rpModal && (
        <div className="evm-overlay" onClick={() => setRpModal(null)}>
          <div className="rpm-card" onClick={(e) => e.stopPropagation()}>
            <button className="evm-close" onClick={() => setRpModal(null)} aria-label="关闭">✕</button>
            <div className="rpm-top">
              <div className="rpm-icon">🧧</div>
              <p className="rpm-title">
                {rpModal.mode === "random" ? "拼手气红包" : "均分红包"}
              </p>
              <p className="rpm-sub">
                {rpModal.total} SC · {rpModal.claimed}/{rpModal.count} 已抢
              </p>
            </div>
            {rpPhase.kind === "result" ? (
              <div className="rpm-result">
                <div className="rpm-amount">+{rpPhase.amount}</div>
                <p>星币已入账 🎉</p>
              </div>
            ) : rpPhase.kind === "fail" ? (
              <div className="rpm-result">
                <div className="rpm-fail">😅</div>
                <p>{rpPhase.message}</p>
              </div>
            ) : (
              <button
                className={`rpm-open${rpPhase.kind === "opening" ? " opening" : ""}`}
                disabled={!isLoggedIn || rpPhase.kind === "opening"}
                onClick={claim}
              >
                {!isLoggedIn ? "登录后可抢" : rpPhase.kind === "opening" ? "…" : "開"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotModal && lottery && (
        <div className="evm-overlay" onClick={() => setLotModal(false)}>
          <div className="lot-card" onClick={(e) => e.stopPropagation()}>
            <button className="evm-close" onClick={() => setLotModal(false)} aria-label="关闭">✕</button>
            <div className="lot-icon">🎰</div>
            <p className="lot-title">{lottery.title}</p>
            {lottery.drawn ? (
              <div className="lot-result">
                <p className="lot-sub">🎉 已开奖 · {lottery.participants} 人参与</p>
                {lottery.winners && lottery.winners.length > 0 ? (
                  <div className="lot-winners">
                    {lottery.winners.map((w, i) => (
                      <span key={i} className="lot-winner">🏆 {w}</span>
                    ))}
                  </div>
                ) : (
                  <p className="lot-sub">无人中奖</p>
                )}
              </div>
            ) : (
              <>
                <div className="lot-count">{remaining}<span>s</span></div>
                <p className="lot-sub">
                  👥 {lottery.participants} 人参与 · 抽 {lottery.winnerCount} 人
                </p>
                <div className="lot-actions">
                  {isLoggedIn ? (
                    <button
                      className={`lot-join${hasJoined ? " joined" : ""}`}
                      disabled={busy || hasJoined}
                      onClick={join}
                    >
                      {hasJoined ? "✓ 已参与，等待开奖" : busy ? "…" : "立即参与"}
                    </button>
                  ) : (
                    <button className="lot-join" disabled>登录后可参与</button>
                  )}
                  {isOwner && (
                    <button className="btn btn-sm" onClick={() => void onDraw(lottery.id)}>
                      提前开奖
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
