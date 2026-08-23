import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatPublishedAt } from "./formatPublishedAt";

describe("formatPublishedAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'just now' for a timestamp under a minute old", () => {
    expect(formatPublishedAt("2026-08-22T11:59:30Z")).toBe("just now");
  });

  it("shows minutes for anything under an hour old", () => {
    expect(formatPublishedAt("2026-08-22T11:45:00Z")).toBe("15m ago");
  });

  it("shows hours for anything under a day old", () => {
    expect(formatPublishedAt("2026-08-22T09:00:00Z")).toBe("3h ago");
  });

  it("shows days for anything under a week old", () => {
    expect(formatPublishedAt("2026-08-19T12:00:00Z")).toBe("3d ago");
  });

  it("switches to an absolute date at 7 days old, no year since it matches now", () => {
    expect(formatPublishedAt("2026-08-15T12:00:00Z")).toBe("Aug 15");
  });

  it("includes the year once the date falls in a different year", () => {
    expect(formatPublishedAt("2025-12-01T12:00:00Z")).toBe("Dec 1, 2025");
  });
});
