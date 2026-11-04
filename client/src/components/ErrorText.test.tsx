import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ErrorText from "./ErrorText";

describe("ErrorText", () => {
  it("renders as an alert by default", () => {
    render(<ErrorText>Boom</ErrorText>);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("omits the alert role when announce is false", () => {
    render(<ErrorText announce={false}>Boom</ErrorText>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });
});
