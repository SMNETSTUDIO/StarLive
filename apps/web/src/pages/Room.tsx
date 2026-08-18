import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DanmakuMessage, GiftDefinition, GiftMessage } from "@starlive/shared";
import ChatPanel from "../components/ChatPanel";
import DanmakuLayer from "../components/DanmakuLayer";
import GiftEffectLayer, { type GiftFx } from "../components/GiftEffectLayer";
import GiftPanel from "../components/GiftPanel";
import LotteryPanel, { type LotteryInfo } from "../components/LotteryPanel";
import Modal from "../components/Modal";
import Player from "../components/Player";
import RankPanel, { type RewardRecord } from "../components/RankPanel";
import RedpacketPanel, { type RedpacketItem } from "../components/RedpacketPanel";
import { useAuth } from "../context/AuthContext";
import { ApiError, get, post } from "../lib/api";
import { giftEmoji } from "../lib/gift-emoji";
import { getGuestId } from "../lib/guest";
import { getSocket } from "../lib/socket";

const REPORT_REASONS = ["违法违规", "色情低俗", "辱骂骚扰", "垃圾广告", "血腥暴力", "其他"];

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
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [shared, setShared] = useState(false);
  const [follow, setFollow] = useState<{ followers: number; following: boolean } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<
    { id: string; name: string; avatarUrl?: string }[]
  >([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetail, setReportDetail] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "done">("idle");
  const messagesRef = useRef<DanmakuMessage[]>([]);

  const isOwner = user?.id === room?.ownerId;
  // 按当前访问域名生成推流地址（MediaMTX RTMP 端口 1935）
  const rtmpUrl = `rtmp://${window.location.hostname}:1935`;

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

  const loadRewards = useCallback(() => {
    get<RewardRecord[]>(`/gift/room-rewards?roomId=${roomId}`).then(setRewards).catch(() => undefined);
  }, [roomId]);

  // 关注状态（依赖房主 ID，房间加载后触发）
  useEffect(() => {
    if (!room?.ownerId) return;
    get<{ followers: number; following: boolean }>(
      `/room/follow-status?targetUserId=${room.ownerId}`,
    )
      .then(setFollow)
      .catch(() => undefined);
  }, [room?.ownerId]);

  const toggleFollow = async () => {
    if (!room) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    try {
      const r = await post<{ followers: number; following: boolean }>(
        follow?.following ? "/room/unfollow" : "/room/follow",
        { targetUserId: room.ownerId },
      );
      setFollow(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(`room_pwd_${roomId}`) ?? undefined;
    void loadRoom(saved);
    void loadGifts();
    void loadRedpackets();
    void loadLottery();
    void loadRewards();

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
      // 刷新贡献榜
      loadRewards();
    };
    const loadViewers = () =>
      get<{ users: { id: string; name: string; avatarUrl?: string }[] }>(
        `/room/viewers?roomId=${roomId}`,
      )
        .then((r) => setOnlineUsers(r.users))
        .catch(() => undefined);
    loadViewers();
    const onPresence = (p: { viewerCount: number }) => {
      setViewers(p.viewerCount);
      loadViewers();
    };
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

  const openReport = () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setReportOpen(true);
  };

  const onSubmitReport = async () => {
    if (!room || reportState === "sending") return;
    setReportState("sending");
    try {
      await post("/report-create", {
        roomId,
        targetUserId: room.ownerId,
        reason: reportDetail.trim() ? `${reportReason}：${reportDetail.trim()}` : reportReason,
      });
      setReportState("done");
      setTimeout(() => {
        setReportOpen(false);
        setReportState("idle");
        setReportDetail("");
        setReportReason(REPORT_REASONS[0]);
      }, 1500);
    } catch (e) {
      setReportState("idle");
      setError((e as Error).message);
      setTimeout(() => setError(""), 3000);
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
        <div className="auth-wrap" style={{ maxWidth: 380 }}>
          <div className="auth-head">
            <span className="auth-mark">🔒</span>
            <h2>私密直播间</h2>
            <p>主播设置了房间密码，输入后即可进入</p>
          </div>
          <div className="card">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label>房间密码</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadRoom(password)}
                placeholder="请输入房间密码…"
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={() => loadRoom(password)}
            >
              进入直播间
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return <div className="empty container">加载中…{error}</div>;
  }

  return (
    <div className="container container-wide">
      <div className="flex between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {room.title}
            {room.status === "active" && <span className="badge badge-live" style={{ marginLeft: 8 }}>直播中</span>}
          </h2>
          <span className="flex" style={{ gap: 8 }}>
            <span className="muted small">{viewers} 人在看</span>
            {onlineUsers.length > 0 && (
              <span className="avatar-stack">
                {onlineUsers.slice(0, 6).map((u) => (
                  <span className="avatar" key={u.id} title={u.name}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : u.name?.[0] ?? "U"}
                  </span>
                ))}
                {onlineUsers.length > 6 && (
                  <span className="avatar" title={`共 ${onlineUsers.length} 位用户在线`}>
                    +{onlineUsers.length - 6}
                  </span>
                )}
              </span>
            )}
          </span>
        </div>
        <div className="flex">
          {!isOwner && follow && (
            <button
              className={`btn btn-sm ${follow.following ? "" : "btn-primary"}`}
              onClick={toggleFollow}
            >
              {follow.following ? "✓ 已关注" : "+ 关注"}
              {follow.followers > 0 && (
                <span style={{ opacity: 0.75, marginLeft: 4 }}>{follow.followers}</span>
              )}
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
              setShared(true);
              setTimeout(() => setShared(false), 1500);
            }}
          >
            {shared ? "✓ 已复制链接" : "分享"}
          </button>
          <Link className="btn btn-sm" to={`/room/${roomId}/danmaku-popout`} target="_blank">
            弹幕窗口
          </Link>
          {isOwner && <Link className="btn btn-sm" to={`/room/${roomId}/recordings`}>录播</Link>}
          {!isOwner && (
            <button className="btn btn-sm btn-ghost" onClick={openReport} title="举报该直播间">
              🚩 举报
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {room.announcement && (
        <div className="alert" style={{ borderColor: "var(--border)" }}>
          📢 {room.announcement}
        </div>
      )}

      <div className="room-grid">
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
                    <p>推流地址：<code>{rtmpUrl}</code></p>
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
                服务器：<code>{rtmpUrl}</code>
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
          <RankPanel rewards={rewards} />
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

      {reportOpen && (
        <Modal title="举报直播间" onClose={() => setReportOpen(false)}>
          {reportState === "done" ? (
            <div className="empty" style={{ padding: "28px 0" }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <p style={{ margin: "8px 0 0" }}>举报已提交，管理员会尽快处理</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label>举报原因</label>
                <div className="chips">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`chip ${reportReason === r ? "active" : ""}`}
                      onClick={() => setReportReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>补充说明（选填）</label>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={200}
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="补充违规行为的具体描述，便于管理员核实…"
                />
              </div>
              <p className="muted small" style={{ margin: "0 0 12px" }}>
                恶意举报可能导致账号处罚，请如实填写。
              </p>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={reportState === "sending"}
                onClick={onSubmitReport}
              >
                {reportState === "sending" ? "提交中…" : "提交举报"}
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
