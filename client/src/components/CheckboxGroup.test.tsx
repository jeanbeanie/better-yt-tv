import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import CheckboxGroup from "./CheckboxGroup";

describe("CheckboxGroup", () => {
  it("names the group from its legend and renders its children inside", () => {
    render(
      <CheckboxGroup legend="Alpha Channel">
        <label>
          <input type="checkbox" />
          Enable in All
        </label>
      </CheckboxGroup>,
    );

    const group = screen.getByRole("group", { name: "Alpha Channel" });

    expect(within(group).getByRole("checkbox", { name: "Enable in All" })).toBeInTheDocument();
  });

  it("keeps the legend first and visually hidden", () => {
    render(
      <CheckboxGroup legend="Alpha Channel">
        <input type="checkbox" aria-label="x" />
      </CheckboxGroup>,
    );
    const legend = screen.getByText("Alpha Channel");

    expect(legend.tagName).toBe("LEGEND");
    expect(legend).toHaveClass("visually-hidden");
    expect(legend.parentElement?.firstElementChild).toBe(legend);
  });

  it("applies the plain-fieldset class, merges className and passes style through", () => {
    render(
      <CheckboxGroup legend="Alpha Channel" className="extra" style={{ gap: "1rem" }}>
        <input type="checkbox" aria-label="x" />
      </CheckboxGroup>,
    );
    const group = screen.getByRole("group", { name: "Alpha Channel" });

    expect(group).toHaveClass("plain-fieldset", "extra");
    expect(group).toHaveStyle({ gap: "1rem" });
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <CheckboxGroup legend="Alpha Channel">
        <label>
          <input type="checkbox" />
          Enable in All
        </label>
      </CheckboxGroup>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
