import { render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import YoutubePlayer, { type YoutubePlayerHandle } from "./YoutubePlayer";

type CapturedEvents = {
  onReady?: () => void;
  onStateChange?: (event: { data: number }) => void;
  onError?: () => void;
};

type CapturedOptions = {
  playerVars?: Record<string, string | number>;
  events?: CapturedEvents;
};

describe("YoutubePlayer", () => {
  let mockPlayerInstance: {
    loadVideoById: ReturnType<typeof vi.fn>;
    cueVideoById: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let mockPlayerConstructor: ReturnType<typeof vi.fn>;
  let capturedEvents: CapturedEvents;
  let capturedOptions: CapturedOptions;

  beforeEach(() => {
    mockPlayerInstance = {
      loadVideoById: vi.fn(),
      cueVideoById: vi.fn(),
      destroy: vi.fn(),
    };
    capturedEvents = {};
    capturedOptions = {};

    // A plain function expression, not an arrow function -- vi.fn() forwards
    // `new window.YT.Player(...)` to this implementation, and arrow
    // functions can never be used as constructors
    mockPlayerConstructor = vi.fn(function (
      _element: HTMLElement,
      options: CapturedOptions,
    ) {
      capturedOptions = options;
      capturedEvents = options.events ?? {};
      return mockPlayerInstance;
    });

    // Pre-set window.YT so loadYouTubeIframeApi() resolves immediately
    // instead of trying to load the real external script
    window.YT = {
      Player: mockPlayerConstructor,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5 },
    } as unknown as typeof window.YT;
  });

  afterEach(() => {
    // Without this, the mock Player constructor leaks onto the shared
    // window global for every other test file, since it's a plain
    // assignment rather than something vi's mock-clearing config resets --
    // any other test that renders FeedView/YoutubePlayer around the same
    // time can pick up this stale mock instead of getting a clean slate
    delete (window as { YT?: unknown }).YT;
  });

  it("calls onError when the underlying player reports a playback error", async () => {
    const handleError = vi.fn();
    render(<YoutubePlayer videoId="v1" onError={handleError} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    capturedEvents.onError?.();

    expect(handleError).toHaveBeenCalledTimes(1);
  });

  it("loads the first video once onReady fires, and retry() reloads it with no prior videoId change", async () => {
    // This is the actual reported bug: retry() silently did nothing for the
    // very first video shown, because currentVideoIdRef was never set until
    // a genuine videoId prop change happened at least once. The video must
    // only be loaded once onReady fires -- not immediately after
    // construction -- since the real IFrame API doesn't accept commands
    // like loadVideoById until then.
    const ref = createRef<YoutubePlayerHandle>();
    render(<YoutubePlayer ref={ref} videoId="v1" />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    // Nothing should have loaded yet -- onReady hasn't fired
    expect(mockPlayerInstance.loadVideoById).not.toHaveBeenCalled();

    capturedEvents.onReady?.();

    expect(mockPlayerInstance.loadVideoById).toHaveBeenCalledWith("v1");

    mockPlayerInstance.loadVideoById.mockClear();

    ref.current?.retry();

    expect(mockPlayerInstance.loadVideoById).toHaveBeenCalledWith("v1");
  });

  it("retry() reloads the currently loaded video directly, bypassing videoId prop-diffing", async () => {
    const ref = createRef<YoutubePlayerHandle>();
    const { rerender } = render(<YoutubePlayer ref={ref} videoId="v1" />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    // Force a real prop change so the video-update effect actually fires
    // loadVideoById once playerRef is populated -- this is what sets
    // currentVideoIdRef, the value retry() reloads
    rerender(<YoutubePlayer ref={ref} videoId="v2" />);
    await waitFor(() => expect(mockPlayerInstance.loadVideoById).toHaveBeenCalledWith("v2"));

    mockPlayerInstance.loadVideoById.mockClear();

    // videoId hasn't changed -- retry() must still reload "v2" by calling
    // the IFrame API directly, not by relying on a prop change
    ref.current?.retry();

    expect(mockPlayerInstance.loadVideoById).toHaveBeenCalledWith("v2");
  });

  it("calls onEnded when the player reports the ENDED state", async () => {
    const handleEnded = vi.fn();
    render(<YoutubePlayer videoId="v1" onEnded={handleEnded} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    capturedEvents.onStateChange?.({ data: 0 });

    expect(handleEnded).toHaveBeenCalledTimes(1);
  });

  it("cues instead of loads the first video when autoplay is false", async () => {
    render(<YoutubePlayer videoId="v1" autoplay={false} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    capturedEvents.onReady?.();

    expect(mockPlayerInstance.cueVideoById).toHaveBeenCalledWith("v1");
    expect(mockPlayerInstance.loadVideoById).not.toHaveBeenCalled();
  });

  it("cues instead of loads a new video on a prop change when autoplay is false", async () => {
    const { rerender } = render(<YoutubePlayer videoId="v1" autoplay={false} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());
    capturedEvents.onReady?.();
    mockPlayerInstance.cueVideoById.mockClear();

    rerender(<YoutubePlayer videoId="v2" autoplay={false} />);

    await waitFor(() => expect(mockPlayerInstance.cueVideoById).toHaveBeenCalledWith("v2"));
    expect(mockPlayerInstance.loadVideoById).not.toHaveBeenCalled();
  });

  it("does not reload when rerendered with the same videoId", async () => {
    const { rerender } = render(<YoutubePlayer videoId="v1" />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());
    capturedEvents.onReady?.();
    expect(mockPlayerInstance.loadVideoById).toHaveBeenCalledTimes(1);

    mockPlayerInstance.loadVideoById.mockClear();
    rerender(<YoutubePlayer videoId="v1" />);

    expect(mockPlayerInstance.loadVideoById).not.toHaveBeenCalled();
  });

  it("destroys the player on unmount", async () => {
    const { unmount } = render(<YoutubePlayer videoId="v1" />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    unmount();

    expect(mockPlayerInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not load or cue anything when mounted with a null videoId", async () => {
    render(<YoutubePlayer videoId={null} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());
    capturedEvents.onReady?.();

    expect(mockPlayerInstance.loadVideoById).not.toHaveBeenCalled();
    expect(mockPlayerInstance.cueVideoById).not.toHaveBeenCalled();
  });

  it("calls the onReady prop when the player becomes ready", async () => {
    const handleReady = vi.fn();
    render(<YoutubePlayer videoId="v1" onReady={handleReady} />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    capturedEvents.onReady?.();

    expect(handleReady).toHaveBeenCalledTimes(1);
  });

  it("constructs the player with the expected playerVars", async () => {
    render(<YoutubePlayer videoId="v1" />);

    await waitFor(() => expect(mockPlayerConstructor).toHaveBeenCalled());

    expect(capturedOptions.playerVars).toEqual({ playsinline: 1, controls: 1, rel: 0 });
  });
});
