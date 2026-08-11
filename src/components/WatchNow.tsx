"use client";

import { formatCompact, formatDate } from "@/lib/formatters";
import { getNewsDisplayDate, type MarketNewsItem } from "@/components/MarketNewsFeed";
import { MARKET_CONTENT_REFRESH_MS } from "@/lib/refresh-policy";
import clsx from "clsx";
import {
  Captions,
  ChevronRight,
  Eye,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WatchNowResponse = {
  ok: boolean;
  news?: MarketNewsItem[];
};

const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";
const CONTROL_HIDE_DELAY_MS = 1800;

export function WatchNow() {
  const playerViewportRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const endedVideoRef = useRef<string | null>(null);
  const controlHideTimerRef = useRef<number | null>(null);
  const pointerOverPlayerRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const [videos, setVideos] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const currentVideo = videos[currentIndex] ?? null;

  useEffect(() => {
    currentVideoIdRef.current = currentVideo?.id ?? null;
  }, [currentVideo?.id]);

  const postPlayerCommand = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      PLAYER_ORIGIN
    );
  }, []);

  const clearControlHideTimer = useCallback(() => {
    if (controlHideTimerRef.current !== null) {
      window.clearTimeout(controlHideTimerRef.current);
      controlHideTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    clearControlHideTimer();
    setControlsVisible(true);
  }, [clearControlHideTimer]);

  const scheduleControlsHide = useCallback(() => {
    clearControlHideTimer();

    if (!isPlaying) {
      return;
    }

    controlHideTimerRef.current = window.setTimeout(() => {
      const playerViewport = playerViewportRef.current;
      const controlsHaveKeyboardFocus =
        playerViewport !== null &&
        document.activeElement instanceof HTMLElement &&
        playerViewport.contains(document.activeElement) &&
        document.activeElement.matches(":focus-visible");

      if (!pointerOverPlayerRef.current && !controlsHaveKeyboardFocus) {
        setControlsVisible(false);
      }
    }, CONTROL_HIDE_DELAY_MS);
  }, [clearControlHideTimer, isPlaying]);

  const chooseVideo = useCallback((index: number) => {
    setCurrentIndex((previousIndex) => {
      const length = videos.length;

      if (!length) {
        return previousIndex;
      }

      return (index + length) % length;
    });
    endedVideoRef.current = null;
    setHasStarted(true);
    setIsPlaying(true);
  }, [videos.length]);

  const playNext = useCallback(() => {
    setCurrentIndex((index) => videos.length ? (index + 1) % videos.length : index);
    endedVideoRef.current = null;
    setHasStarted(true);
    setIsPlaying(true);
  }, [videos.length]);

  const playPrevious = useCallback(() => {
    setCurrentIndex((index) => videos.length ? (index - 1 + videos.length) % videos.length : index);
    endedVideoRef.current = null;
    setHasStarted(true);
    setIsPlaying(true);
  }, [videos.length]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: "8",
      lookbackDays: "60",
      feed: "watch",
      sort: "latest"
    });

    const loadVideos = () => fetch(`/api/market/news?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<WatchNowResponse>)
      .then((payload) => {
        if (!payload.ok) {
          setVideos([]);
          return;
        }

        const nextVideos = (payload.news ?? []).filter((item) => Boolean(item.videoId));
        const selectedVideoId = currentVideoIdRef.current;
        setVideos(nextVideos);
        setCurrentIndex((previousIndex) => {
          if (!nextVideos.length) {
            return 0;
          }

          const selectedIndex = selectedVideoId
            ? nextVideos.findIndex((item) => item.id === selectedVideoId)
            : -1;
          return selectedIndex >= 0 ? selectedIndex : Math.min(previousIndex, nextVideos.length - 1);
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setVideos([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    void loadVideos();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadVideos();
      }
    }, MARKET_CONTENT_REFRESH_MS);
    const refreshVisibleVideos = () => {
      if (document.visibilityState === "visible") {
        void loadVideos();
      }
    };
    window.addEventListener("focus", refreshVisibleVideos);
    document.addEventListener("visibilitychange", refreshVisibleVideos);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleVideos);
      document.removeEventListener("visibilitychange", refreshVisibleVideos);
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const nextFullscreen = document.fullscreenElement === playerViewportRef.current;
      setIsFullscreen(nextFullscreen);
      revealControls();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [revealControls]);

  useEffect(() => {
    if (!isPlaying) {
      revealControls();
    }
  }, [isPlaying, revealControls]);

  useEffect(() => () => clearControlHideTimer(), [clearControlHideTimer]);

  useEffect(() => {
    const playerViewport = playerViewportRef.current;

    if (!playerViewport || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextInView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.42);
        setIsInView(nextInView);

        if (nextInView) {
          setHasStarted(true);
          setIsPlaying(true);
          postPlayerCommand("playVideo");
        } else {
          setIsPlaying(false);
          postPlayerCommand("pauseVideo");
        }
      },
      { threshold: [0, 0.42, 0.7] }
    );

    observer.observe(playerViewport);
    return () => observer.disconnect();
  }, [currentVideo?.videoId, postPlayerCommand]);

  useEffect(() => {
    function handlePlayerMessage(event: MessageEvent) {
      if (
        event.origin !== PLAYER_ORIGIN ||
        event.source !== iframeRef.current?.contentWindow ||
        !currentVideo
      ) {
        return;
      }

      let payload: Record<string, unknown>;

      try {
        payload = typeof event.data === "string"
          ? JSON.parse(event.data) as Record<string, unknown>
          : event.data as Record<string, unknown>;
      } catch {
        return;
      }

      const info = payload.info && typeof payload.info === "object"
        ? payload.info as Record<string, unknown>
        : {};
      const playerState =
        payload.event === "onStateChange" && typeof payload.info === "number"
          ? payload.info
          : typeof info.playerState === "number"
            ? info.playerState
            : null;

      if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) {
        setCurrentTime(Math.max(0, info.currentTime));
      }

      if (typeof info.duration === "number" && Number.isFinite(info.duration)) {
        setDuration(Math.max(0, info.duration));
      }

      if (playerState === 0 && endedVideoRef.current !== currentVideo.videoId) {
        endedVideoRef.current = currentVideo.videoId ?? null;
        playNext();
      } else if (playerState === 1) {
        setIsPlaying(true);
      } else if (playerState === 2) {
        setIsPlaying(false);
      }
    }

    window.addEventListener("message", handlePlayerMessage);
    return () => window.removeEventListener("message", handlePlayerMessage);
  }, [currentVideo, playNext]);

  useEffect(() => {
    endedVideoRef.current = null;
    setCurrentTime(0);
    setDuration(currentVideo?.durationSeconds ?? 0);
  }, [currentVideo?.videoId]);

  useEffect(() => {
    if (!hasStarted || !currentVideo) {
      return;
    }

    const refreshPlaybackPosition = () => {
      postPlayerCommand("getCurrentTime");
      postPlayerCommand("getDuration");
    };

    refreshPlaybackPosition();
    const interval = window.setInterval(refreshPlaybackPosition, 500);
    return () => window.clearInterval(interval);
  }, [currentVideo, hasStarted, postPlayerCommand]);

  const embedUrl = useMemo(() => {
    if (!currentVideo?.videoId || typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams({
      autoplay: "1",
      controls: "0",
      disablekb: "1",
      enablejsapi: "1",
      fs: "0",
      iv_load_policy: "3",
      loop: "0",
      modestbranding: "1",
      mute: "1",
      origin: window.location.origin,
      playsinline: "1",
      rel: "0"
    });

    return `${PLAYER_ORIGIN}/embed/${currentVideo.videoId}?${params.toString()}`;
  }, [currentVideo?.videoId]);

  function handlePlayerLoad() {
    const registerPlayer = () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "rmi-watch-player" }),
        PLAYER_ORIGIN
      );
      postPlayerCommand("addEventListener", ["onStateChange"]);
      postPlayerCommand(isMuted ? "mute" : "unMute");
      postPlayerCommand("loadModule", ["captions"]);
      postPlayerCommand("setOption", [
        "captions",
        "track",
        captionsEnabled ? { languageCode: "en" } : {}
      ]);

      if (isInView) {
        postPlayerCommand("playVideo");
      } else {
        postPlayerCommand("pauseVideo");
      }
    };

    registerPlayer();
    window.setTimeout(registerPlayer, 300);
  }

  function togglePlayback() {
    if (isPlaying) {
      postPlayerCommand("pauseVideo");
      setIsPlaying(false);
    } else {
      setHasStarted(true);
      postPlayerCommand("playVideo");
      setIsPlaying(true);
    }
  }

  function toggleMute() {
    postPlayerCommand(isMuted ? "unMute" : "mute");
    setIsMuted((muted) => !muted);
  }

  function toggleCaptions() {
    const nextEnabled = !captionsEnabled;
    postPlayerCommand("loadModule", ["captions"]);
    postPlayerCommand("setOption", [
      "captions",
      "track",
      nextEnabled ? { languageCode: "en" } : {}
    ]);
    setCaptionsEnabled(nextEnabled);
  }

  function seekTo(nextTime: number) {
    const boundedTime = Math.max(0, Math.min(nextTime, duration));
    setCurrentTime(boundedTime);
    postPlayerCommand("seekTo", [boundedTime, true]);
  }

  async function toggleFullscreen() {
    const playerViewport = playerViewportRef.current;

    if (!playerViewport) {
      return;
    }

    try {
      if (document.fullscreenElement === playerViewport) {
        await document.exitFullscreen();
      } else {
        await playerViewport.requestFullscreen();
      }
    } catch {
      setIsFullscreen(document.fullscreenElement === playerViewport);
    }
  }

  if (!loading && !videos.length) {
    return null;
  }

  return (
    <section className="rmi-card overflow-hidden" aria-labelledby="watch-now-title">
      <div className="rmi-section-header flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <p className="rmi-kicker"><Radio className="h-4 w-4" /> Official videos</p>
          <h2 id="watch-now-title" className="mt-1 text-lg font-bold">Watch Now</h2>
        </div>
        {videos.length > 1 ? (
          <p className="text-xs font-semibold text-paper/45 number-tabular">
            {currentIndex + 1} / {videos.length}
          </p>
        ) : null}
      </div>

      {loading || !currentVideo ? (
        <WatchNowSkeleton />
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="min-w-0 border-b border-line lg:border-b-0 lg:border-r">
            <div
              ref={playerViewportRef}
              data-watch-player
              className="relative aspect-video overflow-hidden bg-black fullscreen:h-screen fullscreen:w-screen fullscreen:aspect-auto"
              onMouseEnter={() => {
                pointerOverPlayerRef.current = true;
                revealControls();
              }}
              onMouseMove={revealControls}
              onMouseLeave={() => {
                pointerOverPlayerRef.current = false;
                scheduleControlsHide();
              }}
              onFocusCapture={revealControls}
              onBlurCapture={scheduleControlsHide}
              onKeyDown={revealControls}
            >
              {currentVideo.thumbnailUrl ? (
                <img
                  src={currentVideo.thumbnailUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              {hasStarted && embedUrl ? (
                <>
                  <iframe
                    key={currentVideo.videoId}
                    ref={iframeRef}
                    src={embedUrl}
                    title={`${currentVideo.title} video player`}
                    className="pointer-events-none absolute inset-0 h-full w-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    tabIndex={-1}
                    onLoad={handlePlayerLoad}
                  />
                  <button
                    type="button"
                    onClick={togglePlayback}
                    className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-cyan"
                    aria-label={isPlaying ? "Pause current video" : "Play current video"}
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setHasStarted(true);
                    setIsPlaying(true);
                  }}
                  className="absolute inset-0 grid place-items-center bg-black/24 text-white"
                  aria-label={`Play ${currentVideo.title}`}
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-cyan text-ink">
                    <Play className="h-6 w-6 fill-current" aria-hidden="true" />
                  </span>
                </button>
              )}

              <div
                className={clsx(
                  "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black/95 to-transparent transition-opacity duration-300",
                  controlsVisible ? "opacity-100" : "opacity-0"
                )}
              />
              <div
                data-watch-controls
                className={clsx(
                  "absolute inset-x-0 bottom-0 z-20 grid gap-2 p-3 transition-opacity duration-300 sm:p-4",
                  controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(duration, 1)}
                    step="0.1"
                    value={Math.min(currentTime, Math.max(duration, 1))}
                    disabled={!duration}
                    onChange={(event) => seekTo(Number(event.currentTarget.value))}
                    className="h-1 min-w-0 flex-1 cursor-pointer accent-cyan disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Video progress"
                  />
                  <span className="min-w-[5.5rem] text-right text-[10px] font-semibold text-white/75 number-tabular">
                    {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PlayerButton onClick={playPrevious} label="Previous video" disabled={videos.length < 2}>
                      <SkipBack className="h-4 w-4 fill-current" />
                    </PlayerButton>
                    <PlayerButton onClick={togglePlayback} label={isPlaying ? "Pause video" : "Play video"} prominent>
                      {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                    </PlayerButton>
                    <PlayerButton onClick={playNext} label="Next video" disabled={videos.length < 2}>
                      <SkipForward className="h-4 w-4 fill-current" />
                    </PlayerButton>
                    <PlayerButton onClick={toggleMute} label={isMuted ? "Unmute video" : "Mute video"}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </PlayerButton>
                    <PlayerButton
                      onClick={toggleCaptions}
                      label={captionsEnabled ? "Turn captions off" : "Turn captions on"}
                      pressed={captionsEnabled}
                    >
                      <Captions className="h-4 w-4" />
                    </PlayerButton>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden rounded-[var(--radius-control)] bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/75 sm:inline">
                      Official video
                    </span>
                    <PlayerButton
                      onClick={toggleFullscreen}
                      label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                      pressed={isFullscreen}
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </PlayerButton>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <Link
                href={`/artists/${currentVideo.artistId}`}
                className="block w-fit text-xs font-semibold text-cyan hover:text-cyan/75"
                aria-label={`${currentVideo.artistName} artist page`}
              >
                {currentVideo.artistName} · {currentVideo.ticker}
              </Link>
              <h3 className="mt-2 text-xl font-bold leading-tight text-paper">{currentVideo.title}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-paper/45">
                <span>{formatDate(getNewsDisplayDate(currentVideo))}</span>
                {typeof currentVideo.viewCount === "number" ? (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatCompact(currentVideo.viewCount)} views
                  </span>
                ) : null}
                <a
                  data-watch-youtube-link
                  href={`https://www.youtube.com/watch?v=${currentVideo.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-panelSoft px-2.5 py-1.5 text-[11px] font-semibold text-paper/60 transition hover:border-cyan/45 hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                  aria-label={`Open ${currentVideo.title} on YouTube in a new tab`}
                >
                  Open on YouTube
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold">More videos</h3>
              <span className="text-[11px] font-medium text-paper/40">Newest first</span>
            </div>
            <div className="max-h-[31rem] overflow-y-auto scrollbar-thin">
              {videos.map((video, index) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => chooseVideo(index)}
                  aria-current={index === currentIndex ? "true" : undefined}
                  className={clsx(
                    "grid w-full grid-cols-[112px_minmax(0,1fr)_18px] items-center gap-3 border-b border-line/70 px-3 py-3 text-left last:border-b-0",
                    index === currentIndex ? "bg-cyan/[0.06]" : "hover:bg-panelSoft"
                  )}
                >
                  <span className="relative aspect-video overflow-hidden rounded-[var(--radius-control)] border border-line bg-panelSoft">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                    {index === currentIndex ? (
                      <span className="absolute bottom-1 left-1 rounded-[var(--radius-control)] bg-cyan px-1.5 py-0.5 text-[9px] font-bold text-ink">
                        Now playing
                      </span>
                    ) : (
                      <span className="absolute inset-0 grid place-items-center bg-black/18 text-white">
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-paper">{video.title}</span>
                    <span className="mt-1 block truncate text-[11px] font-medium text-paper/42">
                      {video.artistName} · {formatDate(getNewsDisplayDate(video))}
                    </span>
                  </span>
                  {index === currentIndex ? (
                    <Pause className="h-4 w-4 text-cyan" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-paper/28" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayerButton({
  onClick,
  label,
  disabled = false,
  prominent = false,
  pressed,
  children
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  prominent?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "grid place-items-center rounded-full border text-white disabled:cursor-not-allowed disabled:opacity-35",
        prominent
          ? "h-10 w-10 border-cyan bg-cyan text-ink"
          : "h-9 w-9 border-white/20 bg-black/65 hover:border-white/45",
        pressed && !prominent && "border-cyan bg-cyan text-ink"
      )}
      aria-label={label}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
    >
      {children}
    </button>
  );
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function WatchNowSkeleton() {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]" aria-label="Loading official videos" aria-busy="true">
      <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
        <div className="rmi-skeleton aspect-video rounded-[var(--radius-control)]" />
        <div className="mt-4 space-y-2">
          <div className="rmi-skeleton h-3 w-24 rounded-[var(--radius-control)]" />
          <div className="rmi-skeleton h-6 w-3/4 rounded-[var(--radius-control)]" />
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
            <div className="rmi-skeleton aspect-video rounded-[var(--radius-control)]" />
            <div className="space-y-2">
              <div className="rmi-skeleton h-4 w-full rounded-[var(--radius-control)]" />
              <div className="rmi-skeleton h-3 w-2/3 rounded-[var(--radius-control)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
