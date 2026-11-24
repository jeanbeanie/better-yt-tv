import { describe, expect, it } from "vitest";
import { assertReadOnlyGit } from "./git.mjs";

describe("read only git allowlist", () => {
  it("rejects writes and destructive flags", () => {
    const blocked = [
      ["add", "package.json"],
      ["commit", "-m", "Release v0.5.1"],
      ["push", "-u", "origin", "main"],
      ["switch", "main"],
      ["pull"],
      ["tag", "-a", "v0.5.1", "-m", "Release v0.5.1"],
      ["tag"],
      ["tag", "-l", "-d", "v0.5.1"],
      ["branch", "-D", "release/x"],
      ["branch", "-m", "new-name"],
      ["stash"],
      ["status"],
      ["status", "--short"],
      ["rev-parse", "HEAD"],
    ];
    for (const args of blocked) {
      expect(() => assertReadOnlyGit(args)).toThrow();
    }
  });
});
