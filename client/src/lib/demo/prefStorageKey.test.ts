import { describe, it, expect, afterEach } from "vitest";
import { prefStorageKey } from "./prefStorageKey";

function setPath(path: string) {
  window.history.pushState({}, "", path);
}

describe("prefStorageKey", () => {
  afterEach(() => {
    setPath("/");
  });

  it("returns the key unchanged outside demo mode", () => {
    setPath("/");
    expect(prefStorageKey("betterYtTv.catchUpMode")).toBe("betterYtTv.catchUpMode");
    expect(prefStorageKey("test.selectedVideoId")).toBe("test.selectedVideoId");
  });

  it("prefixes demo keys and strips the app prefix", () => {
    setPath("/demo/all");
    expect(prefStorageKey("betterYtTv.catchUpMode")).toBe("betterYtTv.demo.catchUpMode");
    expect(prefStorageKey("betterYtTv.selectedVideoId.list.abc")).toBe(
      "betterYtTv.demo.selectedVideoId.list.abc",
    );
    expect(prefStorageKey("test.selectedVideoId")).toBe("betterYtTv.demo.test.selectedVideoId");
  });

  it("reads the URL on every call", () => {
    setPath("/");
    expect(prefStorageKey("betterYtTv.catchUpMode")).toBe("betterYtTv.catchUpMode");
    setPath("/demo");
    expect(prefStorageKey("betterYtTv.catchUpMode")).toBe("betterYtTv.demo.catchUpMode");
  });
});
