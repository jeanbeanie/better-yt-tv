import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { axe } from "vitest-axe";
import DemoBanner from "./DemoBanner";

describe("DemoBanner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the demo notice text", () => {
    render(<DemoBanner />);

    expect(
      screen.getByText(/You're viewing a demo with sample data\. Want an invite\?/),
    ).toBeInTheDocument();
  });

  it("links to GitHub and LinkedIn in a new tab", () => {
    render(<DemoBanner />);

    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("href", "https://github.com/jeanbeanie");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github.getAttribute("rel")).toContain("noreferrer");

    const linkedin = screen.getByRole("link", { name: "LinkedIn" });
    expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/in/jeane-ramos-83339399/");
    expect(linkedin).toHaveAttribute("target", "_blank");
    expect(linkedin.getAttribute("rel")).toContain("noreferrer");
  });

  it("has no axe violations", async () => {
    const { container } = render(<DemoBanner />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not dismiss itself", () => {
    vi.useFakeTimers();
    render(<DemoBanner />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(
      screen.getByText(/You're viewing a demo with sample data\. Want an invite\?/),
    ).toBeInTheDocument();
  });
});
