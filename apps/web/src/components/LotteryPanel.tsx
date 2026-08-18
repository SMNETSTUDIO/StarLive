import { useEffect, useState } from "react";

export interface LotteryInfo {
  id: string;
  title: string;
  winnerCount: number;
  endsAt: number;
  drawn: boolean;
  participants: number;
  winners?: string[];
}

export default function LotteryPanel({
  lottery,
  isOwner,
  isLoggedIn,
  onJoin,
  onDraw,
  onCreate,
}: {
  lottery: LotteryInfo | null;
  isOwner: boolean;
  isLoggedIn: boolean;
  onJoin: (id: string) => void;
  onDraw: (id: string) => void;
  onCreate: (title: string, winnerCount: number, durationSec: number) => void;
}) {
  const [title, setTitle] = useState("幸运抽奖");
  const [winnerCount, setWinnerCount] = useState(1);
  const [durationSec, setDurationSec] = useState(60);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = lottery ? Math.max(0, Math.ceil((lottery.endsAt - now) / 1000)) : 0;

  return (
    <div className="card">
      <h3>🎰 抽奖</h3>
      {lottery ? (
        <div>
          <div className="flex between">
            <b>{lottery.title}</b>
            <span className="badge">{lottery.participants} 人参与</span>
          </div>
          <p className="small muted">
            {lottery.drawn
              ? `已开奖 · 中奖 ${lottery.winnerCount} 人`
              : `剩余 ${remaining}s · 中奖 ${lottery.winnerCount} 人`}
          </p>
          {lottery.winners && lottery.winners.length > 0 && (
            <p className="small" style={{ color: "var(--green)" }}>
              中奖者：{lottery.winners.join("、")}
            </p>
          )}
          <div className="flex">
            {!lottery.drawn && isLoggedIn && (
              <button className="btn btn-sm btn-primary" onClick={() => onJoin(lottery.id)}>
                参与
              </button>
            )}
            {!lottery.drawn && isOwner && (
              <button className="btn btn-sm" onClick={() => onDraw(lottery.id)}>
                开奖
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="muted small">暂无进行中的抽奖</div>
      )}
      {isOwner && (
        <div className="flex wrap" style={{ marginTop: 12 }}>
          <input className="input" style={{ width: 120 }} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" style={{ width: 60 }} type="number" value={winnerCount} onChange={(e) => setWinnerCount(Number(e.target.value))} />
          <input className="input" style={{ width: 60 }} type="number" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} />
          <button className="btn btn-sm btn-primary" onClick={() => onCreate(title, winnerCount, durationSec)}>
            发起
          </button>
        </div>
      )}
    </div>
  );
}
