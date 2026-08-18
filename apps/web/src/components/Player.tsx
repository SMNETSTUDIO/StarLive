import { useEffect, useRef } from "react";
import Hls from "hls.js";

export default function Player({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => undefined);
    }
  }, [src]);

  return (
    <div className="player-wrap">
      <video ref={videoRef} controls autoPlay playsInline muted />
    </div>
  );
}
