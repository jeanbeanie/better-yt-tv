import { describe, it, expect } from "vitest";
import { DEMO_CACHED_VIDEOS, DEMO_REFRESHED_CHANNELS } from "./demoRefresh";
import { DEMO_CHANNELS, DEMO_VIDEOS } from "./fixtures";

describe("demo refresh counts", () => {
  it("matches the fixture channel count", () => {
    expect(DEMO_REFRESHED_CHANNELS).toBe(DEMO_CHANNELS.length);
  });

  it("matches the fixture video count", () => {
    expect(DEMO_CACHED_VIDEOS).toBe(DEMO_VIDEOS.length);
  });
});
