import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import RefreshPausedNotice from "./RefreshPausedNotice";

describe("RefreshPausedNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the paused message", () => {
    render(<RefreshPausedNotice />);

    expect(screen.getByText(/temporarily paused/i)).toBeInTheDocument();
  });

  it("dismisses itself after the message timeout", () => {
    render(<RefreshPausedNotice />);
    expect(screen.getByText(/temporarily paused/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText(/temporarily paused/i)).not.toBeInTheDocument();
  });

  it("is still visible just before the timeout elapses", () => {
    render(<RefreshPausedNotice />);

    vi.advanceTimersByTime(4999);

    expect(screen.getByText(/temporarily paused/i)).toBeInTheDocument();
  });
});
