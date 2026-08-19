import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";

type Status = "connecting" | "waiting" | "playing" | "paused";

const RETRY_MS = 4000;
const AUTO_LEVEL = -1;

// hls.js 模块级单例加载：保持独立 chunk 懒加载，但断流重试/换源
// 反复调用 start() 时只解析一次动态 import，不重复走模块解析。
// 加载失败（弱网 chunk 拉取失败）时清空单例，下次重试重新 import，
// 避免把被拒绝的 Promise 永久缓存导致播放器无法自愈
let hlsModule: Promise<typeof import("hls.js")> | null = null;
function loadHls(): Promise<typeof import("hls.js")> {
  hlsModule ??= import("hls.js").catch((err) => {
    hlsModule = null;
    throw err;
  });
  return hlsModule;
}

interface PlayerProps {
  src: string;
  /** 弹幕/礼物特效等覆盖层，渲染在播放器内部（全屏时可见） */
  children?: ReactNode;
  danmakuOn?: boolean;
  onToggleDanmaku?: () => void;
}

/**
 * B 站风格直播播放器（自绘控制条）：
 * - MSE 可用时始终走 hls.js（部分 Chromium 谎报原生 HLS 支持导致黑屏），
 *   原生 <video> HLS 仅作为 iOS Safari 兜底
 * - 流未就绪 / 中断（Mux 未推流返回 412）自动轮询重连，开播即自动出画面
 * - 多码率清晰度切换（自动 / 1080P / 720P…）、弹幕开关、网页全屏、全屏
 */
export default function Player({ src, children, danmakuOn, onToggleDanmaku }: PlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();
  const hideRef = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatus] = useState<Status>("connecting");
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [webFull, setWebFull] = useState(false);
  const [controlsOn, setControlsOn] = useState(true);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [level, setLevel] = useState(AUTO_LEVEL);
  const [autoLevelNow, setAutoLevelNow] = useState("");
  const [qualityMenu, setQualityMenu] = useState(false);

  // —— 拉流（hls.js 优先）+ 自动重连 ——
  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const sid = ++sessionRef.current;
    clearTimeout(retryRef.current);
    setStatus("connecting");
    setQualityMenu(false);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const scheduleRetry = () => {
      if (sessionRef.current !== sid) return;
      setStatus("waiting");
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(start, RETRY_MS);
    };

    // chunk 加载失败（如弱网）时同样进入自动重试，而非停在 connecting
    const startWithHls = loadHls().then(({ default: HlsCls }) => {
      if (sessionRef.current !== sid) return;

      if (HlsCls.isSupported()) {
        const hls = new HlsCls({
          lowLatencyMode: true,
          liveDurationInfinity: true,
          manifestLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 3,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HlsCls.Events.MANIFEST_PARSED, () => {
          if (sessionRef.current !== sid) return;
          // 高→低排列的清晰度菜单
          const ls = hls.levels
            .map((l, i) => ({ index: i, label: l.height ? `${l.height}P` : `${Math.round(l.bitrate / 1000)}kbps` }))
            .sort((a, b) => (hls.levels[b.index].height ?? 0) - (hls.levels[a.index].height ?? 0));
          setLevels(ls);
        });
        hls.on(HlsCls.Events.LEVEL_SWITCHED, (_e, data) => {
          if (sessionRef.current !== sid) return;
          const h = hls.levels[data.level]?.height;
          setAutoLevelNow(h ? `${h}P` : "");
        });
        hls.on(HlsCls.Events.ERROR, (_e, data) => {
          if (!data.fatal || sessionRef.current !== sid) return;
          if (data.type === HlsCls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            // 网络类致命错误：主播未推流（412）或流中断，稍后自动重试
            hls.destroy();
            if (hlsRef.current === hls) hlsRef.current = null;
            scheduleRetry();
          }
        });
        hlsRef.current = hls;
        video.play().catch(() => undefined);
        return;
      }

      // 兜底：真正的原生 HLS（iOS Safari）
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        const onErr = () => {
          video.removeEventListener("error", onErr);
          scheduleRetry();
        };
        video.addEventListener("error", onErr);
        video.src = src;
        video.play().catch(() => undefined);
        return;
      }

      scheduleRetry();
    });
    void startWithHls.catch(() => scheduleRetry());
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => {
      setStatus("playing");
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPause = () => setStatus((s) => (s === "playing" ? "paused" : s));
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    start();
    return () => {
      sessionRef.current++;
      clearTimeout(retryRef.current);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setLevels([]);
      setLevel(AUTO_LEVEL);
    };
  }, [start]);

  // —— 控制条自动隐藏 ——
  const poke = useCallback(() => {
    setControlsOn(true);
    clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setControlsOn(false), 2800);
  }, []);
  useEffect(() => () => clearTimeout(hideRef.current), []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Esc 退出网页全屏
  useEffect(() => {
    if (!webFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWebFull(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [webFull]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(v.muted);
  };

  const jumpToLive = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1);
    void v.play().catch(() => undefined);
  };

  const switchLevel = (idx: number) => {
    setLevel(idx);
    setQualityMenu(false);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen().catch(() => undefined);
  };

  const live = status === "playing" || status === "paused";
  const showSpinner = status === "connecting" || (buffering && status === "playing");
  const qualityLabel =
    level === AUTO_LEVEL
      ? autoLevelNow
        ? `自动 ${autoLevelNow}`
        : "自动"
      : levels.find((l) => l.index === level)?.label ?? "画质";

  return (
    <div
      ref={wrapRef}
      className={`player-wrap vplayer ${controlsOn || !live ? "vp-controls-on" : ""} ${webFull ? "vp-webfull" : ""}`}
      onMouseMove={poke}
      onMouseLeave={() => {
        setControlsOn(false);
        setQualityMenu(false);
      }}
      onTouchStart={poke}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {/* 弹幕 / 礼物特效层（随播放器进入全屏） */}
      {children}

      {/* 状态遮罩 */}
      {status === "waiting" && (
        <div className="vp-overlay">
          <div className="vp-pulse">📡</div>
          <p>等待直播信号…</p>
          <span className="muted small">主播推流后将自动开始播放</span>
        </div>
      )}
      {showSpinner && <div className="vp-spinner" />}
      {status === "paused" && (
        <button className="vp-bigplay" onClick={togglePlay} aria-label="播放">
          ▶
        </button>
      )}
      {live && muted && (
        <button className="vp-unmute" onClick={toggleMute}>
          🔇 点击开启声音
        </button>
      )}

      {/* 控制条 */}
      <div className="vp-bar">
        <button className="vp-btn" onClick={togglePlay} aria-label={status === "paused" ? "播放" : "暂停"}>
          {status === "paused" ? "▶" : "⏸"}
        </button>
        <button className="vp-btn" onClick={start} title="刷新拉流" aria-label="刷新">
          ↻
        </button>

        <button className={`vp-live ${live ? "on" : ""}`} onClick={jumpToLive} title="跳到最新画面">
          <i />
          直播
        </button>

        <div className="vp-volume">
          <button className="vp-btn" onClick={toggleMute} aria-label={muted ? "取消静音" : "静音"}>
            {muted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="音量"
          />
        </div>

        <span className="vp-flex" />

        {onToggleDanmaku && (
          <button
            className={`vp-pill ${danmakuOn ? "on" : ""}`}
            onClick={onToggleDanmaku}
            title={danmakuOn ? "关闭弹幕" : "开启弹幕"}
          >
            弹
          </button>
        )}

        {levels.length > 1 && (
          <div className="vp-quality">
            <button className="vp-pill" onClick={() => setQualityMenu((v) => !v)}>
              {qualityLabel}
            </button>
            {qualityMenu && (
              <div className="vp-menu">
                <button
                  className={level === AUTO_LEVEL ? "active" : ""}
                  onClick={() => switchLevel(AUTO_LEVEL)}
                >
                  自动
                </button>
                {levels.map((l) => (
                  <button
                    key={l.index}
                    className={level === l.index ? "active" : ""}
                    onClick={() => switchLevel(l.index)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          className="vp-btn"
          onClick={() => setWebFull((v) => !v)}
          title={webFull ? "退出网页全屏" : "网页全屏"}
          aria-label="网页全屏"
        >
          {webFull ? "🗕" : "🗖"}
        </button>
        <button className="vp-btn" onClick={toggleFullscreen} aria-label="全屏">
          {fullscreen ? "🗗" : "⛶"}
        </button>
      </div>
    </div>
  );
}
