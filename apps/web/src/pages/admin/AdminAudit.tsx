import { useEffect, useState } from "react";
import { get, post } from "../../lib/api";

interface AuditEntry {
  action: string;
  adminId: string;
  detail?: unknown;
  ts: number;
}

export default function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    get<AuditEntry[]>("/admin/audit").then(setEntries).catch(() => undefined);
  }, []);

  return (
    <div>
      <h2>操作日志</h2>
      <table className="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>管理员</th>
            <th>操作</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleString()}</td>
              <td>{e.adminId}</td>
              <td>{e.action}</td>
              <td className="small muted">{JSON.stringify(e.detail ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminModeration() {
  const [words, setWords] = useState<string[]>([]);
  const [reports, setReports] = useState<Array<Record<string, string>>>([]);
  const [newWord, setNewWord] = useState("");

  const load = () => {
    get<string[]>("/admin/sensitive-words").then(setWords).catch(() => undefined);
    get<Array<Record<string, string>>>("/admin/reports").then(setReports).catch(() => undefined);
  };

  useEffect(() => {
    void load();
  }, []);

  const addWord = async () => {
    if (!newWord.trim()) return;
    await post("/admin/sensitive-word-add", { word: newWord.trim() });
    setNewWord("");
    load();
  };

  const removeWord = async (word: string) => {
    await post("/admin/sensitive-word-remove", { word });
    load();
  };

  const processReport = async (reportId: string, action: "resolve" | "dismiss") => {
    await post("/admin/report-process", { reportId, action });
    load();
  };

  return (
    <div>
      <h2>内容治理</h2>
      <div className="grid grid-2">
        <div className="card">
          <h3>敏感词</h3>
          <div className="flex" style={{ marginBottom: 12 }}>
            <input className="input" value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="添加敏感词" />
            <button className="btn btn-primary" onClick={addWord}>
              添加
            </button>
          </div>
          <div className="flex wrap">
            {words.map((w) => (
              <span className="badge" key={w} style={{ cursor: "pointer" }} onClick={() => removeWord(w)}>
                {w} ✕
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>举报处理</h3>
          <table className="table">
            <thead>
              <tr>
                <th>举报</th>
                <th>原因</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.id}</td>
                  <td className="small">{r.reason}</td>
                  <td><span className="badge">{r.status}</span></td>
                  <td>
                    {r.status === "pending" && (
                      <div className="flex">
                        <button className="btn btn-sm" onClick={() => processReport(r.id, "resolve")}>处理</button>
                        <button className="btn btn-sm" onClick={() => processReport(r.id, "dismiss")}>驳回</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
