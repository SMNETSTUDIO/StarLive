import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../lib/api";

interface RecordingRow {
  id: string;
  roomId: string;
  roomTitle: string;
  duration: number;
  createdAt: number;
  downloadUrl?: string;
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

export default function AdminRecordings() {
  const [items, setItems] = useState<RecordingRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");

  const load = () => get<RecordingRow[]>("/admin/recordings").then(setItems).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const remove = async (recordingId: string) => {
    if (!confirm("确认删除该录播记录？此操作不可恢复")) return;
    setError("");
    try {
      await post("/admin/recording-delete", { recordingId });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const kw = keyword.trim().toLowerCase();
  const shown = kw
    ? items.filter(
        (r) => r.roomTitle?.toLowerCase().includes(kw) || r.roomId.toLowerCase().includes(kw),
      )
    : items;

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>录播管理</h2>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="🔍 搜索房间…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>房间</th>
            <th>时长</th>
            <th>录制时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td className="table-empty" colSpan={4}>
                暂无录播 · 在「系统设置」开启录播功能后，直播会自动落盘
              </td>
            </tr>
          )}
          {shown.map((r) => (
            <tr key={r.id}>
              <td>
                {r.roomTitle}
                <div className="muted small">{r.roomId}</div>
              </td>
              <td>{fmtDuration(r.duration)}</td>
              <td className="muted small">
                {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
              </td>
              <td>
                <div className="flex">
                  {r.downloadUrl && (
                    <a className="btn btn-sm" href={r.downloadUrl} target="_blank" rel="noreferrer">
                      下载
                    </a>
                  )}
                  <Link className="btn btn-sm" to={`/room/${r.roomId}/recordings`}>
                    房间录播页
                  </Link>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
