import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import HomePage from "./HomePage";
import { hasInviteCode } from "../lib/api";

vi.mock("../lib/api", () => ({
  getLoginUrl: vi.fn(() => "http://localhost:5179/api/auth/login?invite=code-1"),
  hasInviteCode: vi.fn(),
}));

function renderHomePage(props: Partial<Parameters<typeof HomePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <HomePage user={null} error={null} loading={false} {...props} />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("shows the Login button when a code is available", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage();

    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByText(/requires an invite/i)).not.toBeInTheDocument();
  });

  it("shows the invite required message with contact links when no code is available", () => {
    vi.mocked(hasInviteCode).mockReturnValue(false);

    renderHomePage();

    expect(screen.getByText(/requires an invite/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/jeanbeanie",
    );
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/jeane-ramos-83339399/",
    );
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
  });

  it("shows the logged in view regardless of invite code availability", () => {
    vi.mocked(hasInviteCode).mockReturnValue(false);

    renderHomePage({ user: { id: "1", email: "user@example.com", google_sub: "sub-1", is_admin: false } });

    expect(screen.getByText(/logged in as/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to /all videos" })).toBeInTheDocument();
    expect(screen.queryByText(/requires an invite/i)).not.toBeInTheDocument();
  });

  it("shows a spinner while loading", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage({ loading: true });

    expect(screen.getByText(/loading user/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
  });

  it("shows an error message when one is passed", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage({ error: "Something went wrong" });

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows Try the demo with the Login button when a code is available", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage();

    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
  });

  it("tabs to Try the demo before Login when a code is available", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);
    const user = userEvent.setup();

    renderHomePage();

    await user.tab();
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Login" })).toHaveFocus();
  });

  it("shows Try the demo above the invite message when no code is available", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(false);
    const user = userEvent.setup();

    renderHomePage();

    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.getByText(/requires an invite/i)).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveFocus();
  });

  it("gives Try the demo the accessible name and hides its icon", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage();

    const demoLink = screen.getByRole("link", { name: "Try the demo" });
    expect(demoLink).toHaveAccessibleName("Try the demo");
    expect(demoLink.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("hides Try the demo when signed in with or without an invite code", () => {
    const signedInUser = { id: "1", email: "user@example.com", google_sub: "sub-1", is_admin: false };

    vi.mocked(hasInviteCode).mockReturnValue(false);
    const { unmount } = renderHomePage({ user: signedInUser });
    expect(screen.queryByRole("link", { name: "Try the demo" })).not.toBeInTheDocument();
    unmount();

    vi.mocked(hasInviteCode).mockReturnValue(true);
    renderHomePage({ user: signedInUser });
    expect(screen.queryByRole("link", { name: "Try the demo" })).not.toBeInTheDocument();
  });

  it("hides Try the demo while loading", () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    renderHomePage({ loading: true });

    expect(screen.queryByRole("link", { name: "Try the demo" })).not.toBeInTheDocument();
  });

  it("has no accessibility violations with a code available", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);

    const { container } = renderHomePage();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations without a code", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(false);

    const { container } = renderHomePage();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("Try the demo link does not prevent the default browser navigation", async () => {
    vi.mocked(hasInviteCode).mockReturnValue(true);
    const user = userEvent.setup();
    let defaultPrevented: boolean | null = null;
    // document bubble listener, runs after React root handlers
    const recordClick = (event: MouseEvent) => {
      defaultPrevented = event.defaultPrevented;
      event.preventDefault(); // stops jsdom navigation
    };
    document.addEventListener("click", recordClick);

    try {
      renderHomePage();
      await user.click(screen.getByRole("link", { name: "Try the demo" }));
    } finally {
      document.removeEventListener("click", recordClick);
    }

    expect(defaultPrevented).toBe(false);
  });
});
