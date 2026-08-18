import { useEffect, useRef } from "react";

export default function Player({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Safari 原生支持 HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => undefined);
      return;
    }

    // 其他浏览器懒加载 hls.js（拆出独立 chunk，减小房间页首包）
    let hls: { destroy: () => void } | undefined;
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const instance = new Hls({ lowLatencyMode: true });
      instance.loadSource(src);
      instance.attachMedia(video);
      hls = instance;
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className="player-wrap">
      <video ref={videoRef} controls autoPlay playsInline muted />
    </div>
  );
}
