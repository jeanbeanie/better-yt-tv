import { describe, it, expect } from "vitest";
import { applyRoundRobin } from "./feed.js";

type Row = { channel_id: string; video_id: string };

describe("applyRoundRobin", () => {
  it("spreads out a busy channel's videos instead of leaving them consecutive", () => {
    // already sorted published_at desc, same order the real query returns
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a1" },
      { channel_id: "C", video_id: "c1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "b1", "c1", "a2", "a1"]);
  });

  it("keeps every row, only reorders", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a1" },
      { channel_id: "B", video_id: "b1" },
      { channel_id: "A", video_id: "a2" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toHaveLength(rows.length);
    expect(result.map((r) => r.video_id).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("handles a single channel by leaving its order unchanged", () => {
    const rows: Row[] = [
      { channel_id: "A", video_id: "a3" },
      { channel_id: "A", video_id: "a2" },
      { channel_id: "A", video_id: "a1" },
    ];

    const result = applyRoundRobin(rows);

    expect(result.map((r) => r.video_id)).toEqual(["a3", "a2", "a1"]);
  });

  it("handles an empty array", () => {
    expect(applyRoundRobin([])).toEqual([]);
  });

  it("preserves extra fields on each row untouched", () => {
    const rows = [
      { channel_id: "A", video_id: "a1", title: "First" },
      { channel_id: "B", video_id: "b1", title: "Second" },
    ];

    const result = applyRoundRobin(rows);

    expect(result).toEqual(rows);
  });
});
