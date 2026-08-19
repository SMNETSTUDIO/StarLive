import { useState } from "react";

/** 从 Mux 播放地址推导实时截帧封面（image.mux.com，直播中返回最近画面） */
function muxCover(playbackUrl?: string): string | null {
  const m = playbackUrl?.match(/^https:\/\/stream\.mux\.com\/([^./]+)\.m3u8/);
  return m ? `https://image.mux.com/${m[1]}/thumbnail.webp?width=640` : null;
}

/**
 * 直播卡片封面：Mux 房间用官方实时截帧，自建房间走服务端 ffmpeg 截帧接口；
 * 未开播 / 加载失败回退渐变占位图。t 参数按 20s 分桶，随列表轮询刷新画面。
 */
export default function LiveThumb({
  roomId,
  playbackUrl,
  live = true,
}: {
  roomId?: string;
  playbackUrl?: string;
  live?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const bucket = Math.floor(Date.now() / 20000);
  const cover = live
    ? muxCover(playbackUrl) ??
      (roomId ? `/api/room/thumbnail?roomId=${encodeURIComponent(roomId)}&t=${bucket}` : null)
    : null;

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
