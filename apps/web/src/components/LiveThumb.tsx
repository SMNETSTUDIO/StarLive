import { useState } from "react";

/** 从 Mux 播放地址推导实时截帧封面（image.mux.com，直播中返回最近画面） */
function muxCover(playbackUrl?: string): string | null {
  const m = playbackUrl?.match(/^https:\/\/stream\.mux\.com\/([^./]+)\.m3u8/);
  return m ? `https://image.mux.com/${m[1]}/thumbnail.webp?width=640` : null;
}

/** 直播卡片封面：Mux 房间显示实时截帧，其余（自建/未开播/加载失败）回退占位图 */
export default function LiveThumb({ playbackUrl, live = true }: { playbackUrl?: string; live?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cover = live ? muxCover(playbackUrl) : null;

  return (
    <div className="live-thumb">
      {cover && !failed ? (
        <img src={cover} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span style={{ fontSize: 34 }}>{live ? "🎥" : "📺"}</span>
      )}
    </div>
  );
}
