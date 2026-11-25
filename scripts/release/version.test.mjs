import { describe, expect, it } from "vitest";
import {
  bumpVersion,
  compareVersions,
  isVersion,
  parseVersion,
  readPackageVersion,
  setPackageVersion,
  tagName,
} from "./version.mjs";

describe("version helpers", () => {
  it("bumps the file version and names the tag with a v", () => {
    const next = bumpVersion("0.5.0", "patch");
    expect(next).toBe("0.5.1");
    expect(tagName(next)).toBe("v0.5.1");
  });

  it("resets patch on a minor bump", () => {
    expect(bumpVersion("0.5.3", "minor")).toBe("0.6.0");
  });

  it("compares numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.5.0", "0.5.0")).toBe(0);
    expect(compareVersions("0.5.0", "0.5.1")).toBe(-1);
  });

  it("rejects text that is not X.Y.Z", () => {
    expect(isVersion("v0.5.0")).toBe(false);
    expect(isVersion("0.5")).toBe(false);
    expect(() => parseVersion("v0.5.0")).toThrow();
  });

  it("reads the version field from package.json text", () => {
    expect(readPackageVersion('{ "version": "0.5.0" }')).toBe("0.5.0");
  });

  it("changes only the version value in package.json text", () => {
    const original = [
      "{",
      '  "name": "yt-catchup",',
      '  "version": "0.5.0",',
      '  "scripts": {',
      '    "release": "node scripts/release.mjs"',
      "  }",
      "}",
      "",
    ].join("\n");
    const updated = setPackageVersion(original, "0.5.1");
    expect(updated).toBe(original.replace('"version": "0.5.0"', '"version": "0.5.1"'));
  });

  it("throws when package.json text has no version field", () => {
    expect(() => setPackageVersion('{ "name": "yt-catchup" }', "0.5.1")).toThrow();
  });
});
