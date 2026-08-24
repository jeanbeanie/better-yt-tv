import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
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
});
