import { useCallback, useEffect, useState } from "react";
import { get, post } from "../lib/api";
import Modal from "./Modal";

interface Moderator {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface MutedUser {
  identity: string;
  name: string;
  expiresAt: number; // 0 = 永久
}

interface LogEntry {
  actorId: string;
  action: string;
  detail?: unknown;
  ts: number;
}

const ACTION_LABELS: Record<string, string> = {
  add_moderator: "任命房管",
  remove_moderator: "撤销房管",
  mute: "禁言",
  unmute: "解除禁言",
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function fmtRemaining(expiresAt: number): string {
  if (expiresAt === 0) return "永久";
  const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  if (s >= 3600) return `剩 ${Math.ceil(s / 3600)} 小时`;
  if (s >= 60) return `剩 ${Math.ceil(s / 60)} 分钟`;
  return `剩 ${s} 秒`;
}

/**
 * 房间管理面板：房主 / 房管可禁言用户、任命房管、查看操作日志。
 */
export default function RoomModPanel({
  roomId,
  isOwner,
  onlineUsers,
  ownerId,
  onClose,
}: {
  roomId: string;
  isOwner: boolean;
  onlineUsers: { id: string; name: string; avatarUrl?: string }[];
  ownerId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"muted" | "mods" | "log">("muted");
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [muted, setMuted] = useState<MutedUser[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    get<Moderator[]>(`/room-moderators-list?roomId=${roomId}`)
      .then(setModerators)
      .catch(() => undefined);
    get<MutedUser[]>(`/room-muted-users?roomId=${roomId}`)
      .then(setMuted)
      .catch(() => undefined);
    get<LogEntry[]>(`/room-moderation-log?roomId=${roomId}`)
      .then(setLog)
      .catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onUnmute = (identity: string) =>
    run(() => post("/room-user-unmute", { roomId, identity }));

  const onRemoveMod = (targetUserId: string) =>
    run(() => post("/room-moderators-manage", { roomId, targetUserId, action: "remove" }));

  const onAddMod = (targetUserId: string) =>
    run(() => post("/room-moderators-manage", { roomId, targetUserId, action: "add" }));

  const modIds = new Set(moderators.map((m) => m.id));
  // 可任命对象：在线注册用户中排除房主与已有房管
  const candidates = onlineUsers.filter((u) => u.id !== ownerId && !modIds.has(u.id));

  return (
    <Modal title="房间管理" width={520} onClose={onClose}>
      <div className="chips" style={{ marginBottom: 14 }}>
        {(
          [
            ["muted", `禁言中（${muted.length}）`],
            ["mods", `房管（${moderators.length}）`],
            ["log", "操作日志"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`chip ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tab === "muted" && (
        <div className="flex-col" style={{ gap: 8, maxHeight: 360, overflowY: "auto" }}>
          {muted.length === 0 ? (
            <div className="empty small" style={{ padding: "28px 0" }}>
              当前没有被禁言的用户。在聊天区点击消息旁的 🔇 可禁言发言者。
            </div>
          ) : (
            muted.map((m) => (
              <div className="flex between" key={m.identity}>
                <span>
                  {m.name}
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    {fmtRemaining(m.expiresAt)}
                  </span>
                </span>
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => onUnmute(m.identity)}
                >
                  解除禁言
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "mods" && (
        <div className="flex-col" style={{ gap: 14, maxHeight: 360, overflowY: "auto" }}>
          <div>
            <p className="small muted" style={{ margin: "0 0 8px" }}>
              房管可以禁言观众、管理弹幕秩序
            </p>
            {moderators.length === 0 ? (
              <div className="empty small" style={{ padding: "16px 0" }}>
                还没有房管
              </div>
            ) : (
              <div className="flex-col" style={{ gap: 8 }}>
                {moderators.map((m) => (
                  <div className="flex between" key={m.id}>
                    <span className="flex" style={{ gap: 8 }}>
                      <span className="avatar">
                        {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : m.name?.[0] ?? "U"}
                      </span>
                      {m.name}
                    </span>
                    {isOwner && (
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => onRemoveMod(m.id)}
                      >
                        撤销
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isOwner && (
            <div>
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                从在线观众中任命（仅注册用户）
              </p>
              {candidates.length === 0 ? (
                <div className="empty small" style={{ padding: "12px 0" }}>
                  暂无可任命的在线观众
                </div>
              ) : (
                <div className="flex-col" style={{ gap: 8 }}>
                  {candidates.map((u) => (
                    <div className="flex between" key={u.id}>
                      <span className="flex" style={{ gap: 8 }}>
                        <span className="avatar">
                          {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : u.name?.[0] ?? "U"}
                        </span>
                        {u.name}
                      </span>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => onAddMod(u.id)}
                      >
                        设为房管
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "log" && (
        <div className="flex-col" style={{ gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {log.length === 0 ? (
            <div className="empty small" style={{ padding: "28px 0" }}>
              暂无管理操作记录
            </div>
          ) : (
            log.map((e, i) => (
              <div className="small" key={`${e.ts}_${i}`}>
                <span className="muted">{fmtTime(e.ts)}</span>
                <span style={{ margin: "0 6px" }}>{ACTION_LABELS[e.action] ?? e.action}</span>
                {e.detail != null && (
                  <span className="muted">
                    {typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}
