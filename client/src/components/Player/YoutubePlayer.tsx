import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Minimal local typings for the parts of the YouTube IFrame API we need right now
declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        },
      ) => YTPlayerInstance;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayerInstance = {
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
};

type YoutubePlayerProps = {
  // The currently selected YouTube video ID to load into the player
  videoId: string | null;

  // Called when the YouTube player reports that playback reached the ENDED state
  onEnded?: () => void;

  // Called once when the player is first ready
  onReady?: () => void;

  // Called when the YouTube player reports a playback error for the current video
  onError?: () => void;

  // If true, changing videoId should immediately start playback
  // If false, the next video is cued but not auto-played
  autoplay?: boolean;
};

export type YoutubePlayerHandle = {
  // Reloads the currently loaded video -- unlike changing the videoId prop,
  // this works even when the video id hasn't changed (e.g. retrying after
  // a playback error), since it calls the IFrame API directly instead of
  // going through the videoId-diffing effect below
  retry: () => void;
};

// Load the YouTube IFrame API script once for the whole app
function loadYouTubeIframeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      // If it is already present, resolve immediately
      resolve();
      return;
    }

    // todo maybe move script src to constant
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        resolve();
      };
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    document.body.appendChild(script);
  });
}

const YoutubePlayer = forwardRef<YoutubePlayerHandle, YoutubePlayerProps>(function YoutubePlayer(
  { videoId, onEnded, onReady, onError, autoplay = true },
  ref,
) {
  // DOM node where the YouTube API will insert the iframe player
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep a reference to the player instance so we can load/cue videos later
  const playerRef = useRef<YTPlayerInstance | null>(null);

  // Track the current loaded videoId so we don't unnecessarily reload the same video
  const currentVideoIdRef = useRef<string | null>(null);

  // Hold the latest callback props without forcing player recreation
  const onEndedRef = useRef<(() => void) | undefined>(onEnded);
  const onReadyRef = useRef<(() => void) | undefined>(onReady);
  const onErrorRef = useRef<(() => void) | undefined>(onError);

  // Hold the latest videoId/autoplay so the player-creation effect (which
  // only runs once, on mount) can load the first video as soon as the
  // player is actually ready, rather than depending on the separate
  // video-update effect below happening to run again later
  const videoIdRef = useRef(videoId);
  const autoplayRef = useRef(autoplay);

  // Keep callback/value refs fresh when props change
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  useImperativeHandle(ref, () => ({
    retry() {
      if (playerRef.current && currentVideoIdRef.current) {
        playerRef.current.loadVideoById(currentVideoIdRef.current);
      }
    },
  }));


  // Create the player only once after the API script is ready
  // do NOT depend on videoId or callbacks here because video switching
  // should happen through the separate update effect below
  useEffect(() => {
    let cancelled = false;

    async function setupPlayer() {
      await loadYouTubeIframeApi();

      if (cancelled || !containerRef.current || !window.YT?.Player) {
        return;
      }

      // Avoid creating the player twice
      if (playerRef.current) {
        return;
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        playerVars: {
          // Plays inline on mobile Safari instead of forcing fullscreen
          playsinline: 1,
          // Start with standard YouTube controls for the MVP
          controls: 1,
          // Do not autoplay on initial mount unless a video is present and autoplay is intended
          rel: 0,
        },
        events: {
          onReady: () => {
            onReadyRef.current?.();

            // A freshly-constructed player isn't actually ready to accept
            // commands like loadVideoById until this event fires -- that's
            // the whole reason onReady exists as a distinct event rather
            // than the constructor call itself being the "ready" signal.
            // The video-update effect below already ran once by mount time
            // (synchronously, before this async setup had a chance to
            // finish) and bailed out because playerRef.current was still
            // null then, so load whatever video is currently selected now
            // that the player genuinely exists and is ready.
            if (videoIdRef.current && playerRef.current) {
              if (autoplayRef.current) {
                playerRef.current.loadVideoById(videoIdRef.current);
              } else {
                playerRef.current.cueVideoById(videoIdRef.current);
              }
              currentVideoIdRef.current = videoIdRef.current;
            }
          },
          onStateChange: (event) => {
            // YouTube reports ENDED via the player state constant
            if (window.YT && event.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
          onError: () => {
            onErrorRef.current?.();
          },
        },
      });
    }

    void setupPlayer();

    return () => {
      cancelled = true;

      // Clean up the iframe/player when the component unmounts
      playerRef.current?.destroy();
      playerRef.current = null;
      currentVideoIdRef.current = null;
    };
  }, [])

  // CURRENT VIDEO / VIDEO UPDATES LOGIC
  // Update the currently loaded video without rebuilding the player
  useEffect(() => {
    if (!playerRef.current || !videoId) {
      return;
    }

    // Skip if this is already the currently loaded video
    if (currentVideoIdRef.current === videoId) {
      return;
    }

    if (autoplay) {
      playerRef.current.loadVideoById(videoId);
    } else {
      playerRef.current.cueVideoById(videoId);
    }

    currentVideoIdRef.current = videoId;
  }, [videoId, autoplay]);

  return (
    <div className="yt-player">
      {/* The YouTube API replaces this div with an iframe player */}
      <div ref={containerRef} />
    </div>
  );
});

YoutubePlayer.displayName = "YoutubePlayer";

export default YoutubePlayer;
