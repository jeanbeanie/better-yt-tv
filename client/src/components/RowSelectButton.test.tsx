import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import RowSelectButton from "./RowSelectButton";

describe("RowSelectButton", () => {
  it("renders a non-submitting button named by its children", () => {
    render(<RowSelectButton onClick={vi.fn()}>Second Video</RowSelectButton>);
    const button = screen.getByRole("button", { name: "Second Video" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("row-select");
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<RowSelectButton onClick={handleClick}>Pick</RowSelectButton>);
    await user.click(screen.getByRole("button", { name: "Pick" }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
