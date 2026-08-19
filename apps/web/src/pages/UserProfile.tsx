import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { get, post } from "../lib/api";

interface PublicRoom {
  id: string;
  title: string;
  announcement?: string;
  category?: string;
  tags?: string[];
  status: string;
  viewerCount: number;
  createdAt: number;
}

interface PublicProfile {
  user: {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
    createdAt: number;
  };
  followers: number;
  following: boolean;
  followingCount: number;
  rooms: PublicRoom[];
}

function fmtJoined(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
}

/** 公开用户主页：任何人可访问，登录后可关注 */
export default function UserProfile() {
  const { userId = "" } = useParams();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProfile(null);
    setError("");
    get<PublicProfile>(`/user/public?userId=${encodeURIComponent(userId)}`)
      .then(setProfile)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  const toggleFollow = async () => {
    if (!profile || busy) return;
    if (!me) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ followers: number; following: boolean }>(
        profile.following ? "/room/unfollow" : "/room/follow",
        { targetUserId: profile.user.id },
      );
      setProfile((p) => (p ? { ...p, ...r } : p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="empty container" style={{ padding: "100px 0" }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🛸</div>
        <p style={{ margin: "0 0 18px" }}>{error}</p>
        <Link className="btn" to="/live-list">
          去直播广场看看
        </Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container">
        <div className="profile-hero card" aria-hidden>
          <span className="skeleton skeleton-avatar" />
          <div className="flex-col" style={{ gap: 10, flex: 1 }}>
            <span className="skeleton" style={{ width: 180, height: 22 }} />
            <span className="skeleton" style={{ width: 260, height: 14 }} />
          </div>
        </div>
      </div>
    );
  }

  const { user: u, rooms } = profile;
  const liveRoom = rooms.find((r) => r.status === "active");
  const isMe = me?.id === u.id;

  return (
    <div className="container">
      <div className="profile-hero card">
        <span className="avatar avatar-xl">
          {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : u.name?.[0] ?? "U"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{u.name}</h2>
            {liveRoom && (
              <Link className="badge badge-live" to={`/room/${liveRoom.id}`}>
                直播中
              </Link>
            )}
          </div>
          <p className="muted small" style={{ margin: "4px 0 10px" }}>
            @{u.username}
            {u.createdAt > 0 && <> · {fmtJoined(u.createdAt)}加入</>}
          </p>
          <div className="flex" style={{ gap: 18 }}>
            <span className="small">
              <b>{profile.followers}</b> <span className="muted">粉丝</span>
            </span>
            <span className="small">
              <b>{profile.followingCount}</b> <span className="muted">关注</span>
            </span>
          </div>
        </div>
        {!isMe && (
          <button
            className={`btn ${profile.following ? "" : "btn-primary"}`}
            disabled={busy}
            onClick={toggleFollow}
          >
            {profile.following ? "✓ 已关注" : "+ 关注"}
          </button>
        )}
        {isMe && (
          <Link className="btn" to="/profile">
            编辑资料
          </Link>
        )}
      </div>

      <h3 style={{ margin: "24px 0 12px" }}>Ta 的直播间</h3>
      {rooms.length === 0 ? (
        <div className="empty" style={{ padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📺</div>
          <p style={{ margin: 0 }}>Ta 还没有公开的直播间</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {rooms.map((r) => (
            <Link
              to={`/room/${r.id}`}
              key={r.id}
              className="card card-hover"
              style={{ color: "inherit" }}
            >
              <div className="live-thumb">
                <span style={{ fontSize: 34 }}>{r.status === "active" ? "🎥" : "📺"}</span>
              </div>
              <div className="flex between" style={{ marginTop: 14 }}>
                {r.status === "active" ? (
                  <span className="badge badge-live">直播中</span>
                ) : (
                  <span className="badge">未开播</span>
                )}
                {r.status === "active" && <span className="badge">👀 {r.viewerCount}</span>}
              </div>
              <h3 style={{ margin: "10px 0 2px", fontSize: 16 }}>{r.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {r.category || "未分类"}
                {r.tags && r.tags.length > 0 && <> · {r.tags.join(" / ")}</>}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
