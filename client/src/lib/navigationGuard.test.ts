import { describe, it, expect, vi } from "vitest";
import type { MouseEvent } from "react";
import {
  setNavigationGuard,
  clearNavigationGuard,
  isNavigationAllowed,
  guardClick,
} from "./navigationGuard";

function makeClickEvent() {
  return { preventDefault: vi.fn() } as unknown as MouseEvent<HTMLAnchorElement>;
}

describe("navigationGuard", () => {
  it("allows navigation when no guard is registered", () => {
    expect(isNavigationAllowed()).toBe(true);
  });

  it("allows navigation without asking when the registered guard reports clean", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const fn = () => false;
    setNavigationGuard(fn);

    expect(isNavigationAllowed()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    clearNavigationGuard(fn);
  });

  it("asks for confirmation when the registered guard reports dirty", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fn = () => true;
    setNavigationGuard(fn);

    expect(isNavigationAllowed()).toBe(true);
    expect(confirmSpy).toHaveBeenCalledWith("You have unsaved changes. Leave this page?");

    confirmSpy.mockRestore();
    clearNavigationGuard(fn);
  });

  it("respects a custom message", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fn = () => true;
    setNavigationGuard(fn);

    isNavigationAllowed("Custom message");
    expect(confirmSpy).toHaveBeenCalledWith("Custom message");

    confirmSpy.mockRestore();
    clearNavigationGuard(fn);
  });

  it("returns false when the confirm dialog is dismissed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fn = () => true;
    setNavigationGuard(fn);

    expect(isNavigationAllowed()).toBe(false);

    confirmSpy.mockRestore();
    clearNavigationGuard(fn);
  });

  it("only clears the guard if the function passed in is still the active one", () => {
    const stale = () => false;
    const active = () => true;
    setNavigationGuard(stale);
    setNavigationGuard(active);

    clearNavigationGuard(stale);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    isNavigationAllowed();
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    clearNavigationGuard(active);
  });

  describe("guardClick", () => {
    it("calls the wrapped onClick when navigation is allowed", () => {
      const onClick = vi.fn();
      const event = makeClickEvent();

      guardClick(onClick)(event);

      expect(onClick).toHaveBeenCalledWith(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it("works with no onClick passed in", () => {
      const event = makeClickEvent();
      expect(() => guardClick()(event)).not.toThrow();
    });

    it("prevents default and skips onClick when navigation is blocked", () => {
      const fn = () => true;
      setNavigationGuard(fn);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      const onClick = vi.fn();
      const event = makeClickEvent();
      guardClick(onClick)(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
      clearNavigationGuard(fn);
    });
  });

  describe("beforeunload", () => {
    it("prevents default when dirty", () => {
      const fn = () => true;
      setNavigationGuard(fn);

      const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      clearNavigationGuard(fn);
    });

    it("does not prevent default when clean", () => {
      const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
