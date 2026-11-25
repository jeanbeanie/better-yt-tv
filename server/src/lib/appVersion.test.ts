import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./appVersion";

describe("APP_VERSION", () => {
  it("is the root package version with a v prefix", () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});
