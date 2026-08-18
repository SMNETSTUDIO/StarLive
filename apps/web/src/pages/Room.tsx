import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DanmakuMessage, GiftDefinition, GiftMessage } from "@starlive/shared";
import ChatPanel from "../components/ChatPanel";
import DanmakuLayer from "../components/DanmakuLayer";
import GiftEffectLayer, { type GiftFx } from "../components/GiftEffectLayer";
import GiftPanel from "../components/GiftPanel";
import LotteryPanel, { type LotteryInfo } from "../components/LotteryPanel";
import Player from "../components/Player";
import RedpacketPanel, { type RedpacketItem } from "../components/RedpacketPanel";
import { useAuth } from "../context/AuthContext";
import { ApiError, get, post } from "../lib/api";
import { giftEmoji } from "../lib/gift-emoji";
import { getGuestId } from "../lib/guest";
import { getSocket } from "../lib/socket";

interface RoomData {
  id: string;
  title: string;
  announcement?: string;
  ownerId: string;
  isPublic: boolean;
  status: string;
  playbackUrl?: string;
  streamKey?: string;
  viewerCount: number;
  registeredCount: number;
  guestCount: number;
}

export default function Room() {
  const { roomId = "" } = useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<DanmakuMessage[]>([]);
  const [gifts, setGifts] = useState<GiftDefinition[]>([]);
  const [redpackets, setRedpackets] = useState<RedpacketItem[]>([]);
  const [lottery, setLottery] = useState<LotteryInfo | null>(null);
  const [viewers, setViewers] = useState(0);
  const [giftFx, setGiftFx] = useState<GiftFx[]>([]);
  const messagesRef = useRef<DanmakuMessage[]>([]);

  const isOwner = user?.id === room?.ownerId;

  const appendMessage = useCallback((m: DanmakuMessage) => {
    messagesRef.current = [...messagesRef.current.slice(-200), m];
    setMessages(messagesRef.current);
  }, []);

  const loadRoom = useCallback(
    async (pwd?: string) => {
      try {
        const q = pwd ? `?roomId=${roomId}&password=${encodeURIComponent(pwd)}` : `?roomId=${roomId}`;
        const r = await get<RoomData>(`/room/get${q}`);
        setRoom(r);
        setViewers(r.viewerCount ?? 0);
        setNeedPassword(false);
        if (pwd) sessionStorage.setItem(`room_pwd_${roomId}`, pwd);
      } catch (e) {
        if ((e as ApiError).code === 3001) {
          setNeedPassword(true);
        } else {
          setError((e as Error).message);
        }
      }
    },
    [roomId],
  );

  const loadGifts = useCallback(() => {
    get<GiftDefinition[]>("/gift/list").then(setGifts).catch(() => undefined);
  }, []);

  const loadRedpackets = useCallback(() => {
    get<RedpacketItem[]>(`/redpacket/list?roomId=${roomId}`).then(setRedpackets).catch(() => undefined);
  }, [roomId]);

  const loadLottery = useCallback(() => {
    get<LotteryInfo | null>(`/lottery/get?roomId=${roomId}`).then(setLottery).catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    const saved = sessionStorage.getItem(`room_pwd_${roomId}`) ?? undefined;
    void loadRoom(saved);
    void loadGifts();
    void loadRedpackets();
    void loadLottery();

    get<DanmakuMessage[]>(`/danmaku/recent?roomId=${roomId}`)
      .then((msgs) => {
        messagesRef.current = msgs;
        setMessages(msgs);
      })
      .catch(() => undefined);

    const socket = getSocket();
    socket.emit("join_room", { roomId });

    const onDanmaku = (m: DanmakuMessage) => appendMessage(m);
    const onGift = (g: GiftMessage) => {
      const emoji = giftEmoji(g.giftId, g.giftIcon);
      // 写入聊天区
      appendMessage({
        id: g.id,
        roomId: g.roomId,
        name: g.fromName,
        content: `送出 ${emoji} ${g.giftName} ×${g.count}`,
        color: "#ffd60a",
        ts: g.ts,
      } as DanmakuMessage);
      // 播放特效（总价 ≥520 触发全屏爆发）
      const fx: GiftFx = {
        id: `${g.id}_${g.ts}`,
        emoji,
        fromName: g.fromName,
        giftName: g.giftName,
        count: g.count,
        big: g.price * g.count >= 520,
      };
      setGiftFx((list) => [...list.slice(-4), fx]);
      setTimeout(() => {
        setGiftFx((list) => list.filter((x) => x.id !== fx.id));
      }, 3900);
    };
    const onPresence = (p: { viewerCount: number }) => setViewers(p.viewerCount);
    const onRoomStatus = (p: { status: string }) => setRoom((r) => (r ? { ...r, status: p.status } : r));
    const onRedpacketCreated = () => loadRedpackets();
    const onRedpacketClaimed = () => loadRedpackets();
    const onLotteryEvent = () => loadLottery();

    socket.on("danmaku", onDanmaku);
    socket.on("gift", onGift);
    socket.on("presence", onPresence);
    socket.on("room.status", onRoomStatus);
    socket.on("redpacket.created", onRedpacketCreated);
    socket.on("redpacket.claimed", onRedpacketClaimed);
    socket.on("lottery.started", onLotteryEvent);
    socket.on("lottery.joined", onLotteryEvent);
    socket.on("lottery.drawn", onLotteryEvent);

    const heartbeat = setInterval(() => {
      post(`/room/${roomId}/heartbeat`, { guestId: getGuestId() }).catch(() => undefined);
    }, 10000);
    void post(`/room/${roomId}/heartbeat`, { guestId: getGuestId() }).catch(() => undefined);

    return () => {
      socket.emit("leave_room", { roomId });
      socket.off("danmaku", onDanmaku);
      socket.off("gift", onGift);
      socket.off("presence", onPresence);
      socket.off("room.status", onRoomStatus);
      socket.off("redpacket.created", onRedpacketCreated);
      socket.off("redpacket.claimed", onRedpacketClaimed);
      socket.off("lottery.started", onLotteryEvent);
      socket.off("lottery.joined", onLotteryEvent);
      socket.off("lottery.drawn", onLotteryEvent);
      clearInterval(heartbeat);
    };
  }, [roomId, appendMessage, loadRoom, loadGifts, loadRedpackets, loadLottery]);

  const onSendDanmaku = async (content: string) => {
    try {
      await post("/danmaku/send", {
        roomId,
        content,
        guestId: user ? undefined : getGuestId(),
        name: user?.name ?? `游客_${getGuestId().slice(-4)}`,
      });
    } catch (e) {
      setError((e as Error).message);
      setTimeout(() => setError(""), 3000);
    }
  };

  const onSendGift = async (giftId: string, count: number) => {
    try {
      await post("/gift/send", { roomId, giftId, count });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onClaimRedpacket = async (id: string) => {
    try {
      await post("/redpacket/claim", { redpacketId: id });
      loadRedpackets();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onCreateRedpacket = async (total: number, count: number, mode: string) => {
    try {
      await post("/redpacket/create", { roomId, total, count, mode });
      loadRedpackets();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onJoinLottery = async (id: string) => {
    try {
      await post("/lottery/join", { lotteryId: id });
      loadLottery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDrawLottery = async (id: string) => {
    try {
      await post("/lottery/draw", { lotteryId: id });
      loadLottery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onCreateLottery = async (title: string, winnerCount: number, durationSec: number) => {
    try {
      await post("/lottery/create", { roomId, title, winnerCount, durationSec });
      loadLottery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (needPassword) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 360, margin: "60px auto" }}>
          <h3>房间需要密码</h3>
          <div className="field">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入房间密码"
            />
          </div>
          <button className="btn btn-primary" onClick={() => loadRoom(password)}>
            进入
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return <div className="empty container">加载中…{error}</div>;
  }

  return (
    <div className="container" style={{ maxWidth: 1280 }}>
      <div className="flex between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {room.title}
            {room.status === "active" && <span className="badge badge-live" style={{ marginLeft: 8 }}>直播中</span>}
          </h2>
          <span className="muted small">{viewers} 人在看</span>
        </div>
        <div className="flex">
          <Link className="btn btn-sm" to={`/room/${roomId}/danmaku-popout`} target="_blank">
            弹幕窗口
          </Link>
          {isOwner && <Link className="btn btn-sm" to={`/room/${roomId}/recordings`}>录播</Link>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {room.announcement && (
        <div className="alert" style={{ borderColor: "var(--border)" }}>
          📢 {room.announcement}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        <div>
          {room.playbackUrl ? (
            <div style={{ position: "relative" }}>
              <Player src={room.playbackUrl} />
              <DanmakuLayer messages={messages} />
              <GiftEffectLayer effects={giftFx} />
            </div>
          ) : (
            <div className="player-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GiftEffectLayer effects={giftFx} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 48 }}>📺</div>
                <p className="muted">主播暂未开播</p>
                {isOwner && room.streamKey && (
                  <div className="card small" style={{ textAlign: "left" }}>
                    <p>推流地址：<code>rtmp://服务器:1935</code></p>
                    <p>推流密钥：<code>{room.streamKey}</code></p>
                  </div>
                )}
              </div>
            </div>
          )}
          {isOwner && room.streamKey && (
            <div className="card small" style={{ marginTop: 12 }}>
              <div className="flex between" style={{ marginBottom: 8 }}>
                <b>📡 推流信息（OBS）</b>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(room.streamKey ?? "");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "✓ 已复制" : "复制密钥"}
                </button>
              </div>
              <p style={{ margin: "4px 0" }}>
                服务器：<code>rtmp://&lt;host&gt;:1935</code>
              </p>
              <p style={{ margin: "4px 0" }}>
                串流密钥：<code>{room.streamKey}</code>
              </p>
            </div>
          )}
        </div>

        <div className="flex-col">
          <ChatPanel messages={messages} onSend={onSendDanmaku} />
          <GiftPanel gifts={gifts} onSend={onSendGift} />
          <RedpacketPanel
            redpackets={redpackets}
            isLoggedIn={!!user}
            onClaim={onClaimRedpacket}
            onCreate={onCreateRedpacket}
          />
          <LotteryPanel
            lottery={lottery}
            isOwner={isOwner}
            isLoggedIn={!!user}
            onJoin={onJoinLottery}
            onDraw={onDrawLottery}
            onCreate={onCreateLottery}
          />
        </div>
      </div>
    </div>
  );
}
