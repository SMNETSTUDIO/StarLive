import { useEffect, useState } from "react";
import { get } from "../lib/api";

interface Announcement {
  title: string;
  content: string;
}

export default function AnnouncementModal() {
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    get<Announcement>("/system/announcement")
      .then((a) => {
        if (a && a.content) {
          const dismissed = localStorage.getItem(`ann_${a.content.slice(0, 20)}`);
          if (!dismissed) setAnn(a);
        }
      })
      .catch(() => undefined);
  }, []);

  if (!ann) return null;

  const close = () => {
    localStorage.setItem(`ann_${ann.content.slice(0, 20)}`, "1");
    setAnn(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={close}
    >
      <div className="card" style={{ maxWidth: 420, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <h3>{ann.title || "系统公告"}</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{ann.content}</p>
        <div className="flex" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={close}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
