import { describe, it, expect, afterEach } from "vitest";
import { isDemoMode, getRouterBasename } from "./mode";

function setPath(path: string) {
  window.history.pushState({}, "", path);
}

describe("isDemoMode", () => {
  afterEach(() => {
    setPath("/");
  });

  it.each(["/demo", "/demo/", "/demo/all", "/demo/settings/channels", "/demo?x=1"])(
    "is true at %s",
    (path) => {
      setPath(path);
      expect(isDemoMode()).toBe(true);
    },
  );

  it.each([
    "/",
    "/all",
    "/demonstration",
    "/demos",
    "/demo-x",
    "/settings/demo",
    "/?next=/demo",
  ])("is false at %s", (path) => {
    setPath(path);
    expect(isDemoMode()).toBe(false);
  });

  it("reads the URL on every call", () => {
    setPath("/");
    expect(isDemoMode()).toBe(false);
    setPath("/demo/all");
    expect(isDemoMode()).toBe(true);
    setPath("/");
    expect(isDemoMode()).toBe(false);
  });
});

describe("getRouterBasename", () => {
  afterEach(() => {
    setPath("/");
  });

  it.each(["/demo", "/demo/all"])("is /demo at %s", (path) => {
    setPath(path);
    expect(getRouterBasename()).toBe("/demo");
  });

  it.each(["/", "/all", "/demonstration"])("is / at %s", (path) => {
    setPath(path);
    expect(getRouterBasename()).toBe("/");
  });
});
