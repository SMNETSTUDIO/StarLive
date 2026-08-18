import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { get, post } from "../lib/api";

interface RecordingItem {
  id: string;
  duration: number;
  createdAt: number;
  downloadUrl?: string;
}

interface ShareItem {
  token: string;
  recordingId: string;
  createdAt: number;
  expiresAt: number;
  permanent: boolean;
}

export default function Recordings() {
  const { roomId = "" } = useParams();
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState("");

  const load = () => {
    get<RecordingItem[]>(`/recording/list?roomId=${roomId}`).then(setRecordings).catch(() => undefined);
    get<ShareItem[]>(`/recording/share-list?roomId=${roomId}`)
      .then(setShares)
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, [roomId]);

  const createShare = async (recordingId: string, permanent: boolean) => {
    try {
      await post("/recording/share-create", { recordingId, permanent });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const revokeShare = async (token: string) => {
    try {
      await post("/recording/share-revoke", { token });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyShare = (token: string) => {
    const url = `${location.origin}/api/recording/share-info?token=${token}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(""), 1500);
  };

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h2 className="page-title">录播管理</h2>
          <p className="page-sub">直播回放的下载与分享链接管理</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <h3>🎞️ 录播列表</h3>
        {recordings.length === 0 ? (
          <div className="empty small" style={{ padding: "28px 0" }}>
            📼 暂无录播 · 在管理后台开启录播功能后，直播会自动落盘
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>时长</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{Math.round(r.duration / 60)} 分钟</td>
                  <td>
                    <div className="flex">
                      {r.downloadUrl && (
                        <a className="btn btn-sm" href={r.downloadUrl} target="_blank" rel="noreferrer">
                          下载
                        </a>
                      )}
                      <button className="btn btn-sm" onClick={() => createShare(r.id, false)}>
                        分享 7 天
                      </button>
                      <button className="btn btn-sm" onClick={() => createShare(r.id, true)}>
                        永久分享
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>🔗 分享链接</h3>
        {shares.length === 0 ? (
          <div className="empty small" style={{ padding: "28px 0" }}>
            还没有创建分享链接
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>有效期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.token}>
                  <td>{s.token.slice(0, 12)}…</td>
                  <td>{s.permanent ? "永久" : new Date(s.expiresAt).toLocaleString()}</td>
                  <td>
                    <div className="flex">
                      <button className="btn btn-sm" onClick={() => copyShare(s.token)}>
                        {copiedToken === s.token ? "✓ 已复制" : "复制链接"}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => revokeShare(s.token)}>
                        撤销
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
