import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MarkdownPage from "./MarkdownPage";

describe("MarkdownPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a spinner while loading, then the rendered markdown", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("Some body text.", { status: 200 }),
      ) as unknown as typeof fetch;

    render(<MarkdownPage title="Privacy Policy" src="/privacy.md" loadingLabel="Loading..." />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();

    expect(await screen.findByText("Some body text.")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
  });

  it("renders the subtitle when one is given", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("content", { status: 200 })) as unknown as typeof fetch;

    render(
      <MarkdownPage
        title="Terms of Service"
        subtitle="Last updated recently"
        src="/terms.md"
        loadingLabel="Loading..."
      />,
    );

    expect(await screen.findByText("Last updated recently")).toBeInTheDocument();
  });

  it("shows an error instead of the article when the fetch fails", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;

    render(<MarkdownPage title="Privacy Policy" src="/privacy.md" loadingLabel="Loading..." />);

    expect(await screen.findByText(/failed to load privacy policy: 404/i)).toBeInTheDocument();
  });

  it("fetches from the given src", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("content", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<MarkdownPage title="Terms of Service" src="/terms.md" loadingLabel="Loading..." />);

    await screen.findByText("content");
    expect(fetchMock).toHaveBeenCalledWith("/terms.md");
  });
});
