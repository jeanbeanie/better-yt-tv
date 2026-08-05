import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LivePage from "./LivePage";

describe("LivePage", () => {
  it("shows a coming-soon message", () => {
    render(<LivePage />);

    expect(
      screen.getByText(/costs more YouTube API quota than we get in a day/i),
    ).toBeInTheDocument();
  });
});
