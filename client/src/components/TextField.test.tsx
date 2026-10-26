import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import TextField from "./TextField";

describe("TextField", () => {
  it("names the input from its label", () => {
    render(<TextField label="Search your channels" />);

    expect(screen.getByRole("textbox", { name: "Search your channels" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search your channels")).toBeInTheDocument();
  });

  it("keeps the label in the DOM and hides it visually when hideLabel is set", () => {
    render(<TextField label="Search" hideLabel />);

    expect(screen.getByText("Search")).toHaveClass("visually-hidden");
    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });

  it("shows the label normally when hideLabel is not set", () => {
    render(<TextField label="Search" />);

    expect(screen.getByText("Search")).not.toHaveClass("visually-hidden");
  });

  it("defaults to a text input with the text-input class and merges className", () => {
    render(<TextField label="Name" className="extra" />);
    const input = screen.getByRole("textbox", { name: "Name" });

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveClass("text-input", "extra");
  });

  it("passes onChange and placeholder through to the input", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<TextField label="Name" placeholder="Type here" onChange={handleChange} />);
    await user.type(screen.getByPlaceholderText("Type here"), "ab");

    expect(handleChange).toHaveBeenCalledTimes(2);
  });

  it("gives each instance its own id", () => {
    render(
      <>
        <TextField label="First" />
        <TextField label="Second" />
      </>,
    );

    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });

  it("has no axe violations", async () => {
    const { container } = render(<TextField label="Search" hideLabel />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
