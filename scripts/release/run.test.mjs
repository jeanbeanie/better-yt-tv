import { describe, expect, it, vi } from "vitest";
import { assertReadOnlyGit } from "./git.mjs";
import { CHANGELOG_PATH, PACKAGE_PATH, main } from "./run.mjs";

const PACKAGE_TEXT = [
  "{",
  '  "name": "yt-catchup",',
  '  "version": "0.5.0",',
  '  "scripts": {',
  '    "release": "node scripts/release.mjs"',
  "  }",
  "}",
  "",
].join("\n");

const CHANGELOG_TEXT = ["## 2026-11-24", "", "- Added a new thing", "- Fixed a bug", ""].join("\n");

// fake repo: in memory files, canned git state, git calls checked by the read only allowlist
function setup({ branch = "release/next", status = "", tags = [], files = {}, date = "2026-11-24" } = {}) {
  const store = new Map([
    [PACKAGE_PATH, PACKAGE_TEXT],
    [CHANGELOG_PATH, CHANGELOG_TEXT],
    ...Object.entries(files),
  ]);
  const writeFile = vi.fn((path, text) => store.set(path, text));
  const gitCalls = [];
  const git = (args) => {
    assertReadOnlyGit(args);
    gitCalls.push(args);
    if (args[0] === "branch") return `${branch}\n`;
    if (args[0] === "status") return status;
    if (args[0] === "tag") return tags.map((tag) => `${tag}\n`).join("");
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
  const out = [];
  const err = [];
  const deps = {
    readFile: (path) => {
      if (!store.has(path)) throw new Error(`missing ${path}`);
      return store.get(path);
    },
    writeFile,
    git,
    today: () => date,
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  };
  return { deps, store, writeFile, gitCalls, out, err };
}

const versionOf = (lines) => /v\d+\.\d+\.\d+/.exec(lines.join("\n"))[0];

describe("release refusals", () => {
  it.each([
    ["main", { branch: "main" }],
    ["a dirty tree", { status: " M client/public/changelog.md\n" }],
    ["a detached HEAD", { branch: "" }],
  ])("refuses on %s with exit code 1 and writes nothing", (_label, options) => {
    const env = setup(options);
    expect(main([], env.deps)).toBe(1);
    expect(env.writeFile).not.toHaveBeenCalled();
  });

  it("refuses on main in dry run too", () => {
    const env = setup({ branch: "main" });
    expect(main(["--dry-run"], env.deps)).toBe(1);
    expect(env.writeFile).not.toHaveBeenCalled();
  });

  it("refuses a version not above the highest tag", () => {
    const env = setup({ tags: ["v0.5.0", "v0.6.0"] });
    expect(main(["minor"], env.deps)).toBe(1);
    expect(env.writeFile).not.toHaveBeenCalled();
  });

  it("refuses with no argument and no entries when the current version is tagged", () => {
    const env = setup({
      tags: ["v0.5.0"],
      files: { [CHANGELOG_PATH]: "## 2026-11-24\n\n- **Released v0.5.0**\n" },
    });
    expect(main([], env.deps)).toBe(1);
    expect(env.writeFile).not.toHaveBeenCalled();
  });

  it("refuses a first release whose changelog already has the marker", () => {
    const env = setup({ tags: [], files: { [CHANGELOG_PATH]: "## 2026-11-24\n\n- **Released v0.5.0**\n" } });
    expect(main([], env.deps)).toBe(1);
    expect(env.writeFile).not.toHaveBeenCalled();
  });

  it("allows an explicit minor bump when the changelog already has the marker", () => {
    const env = setup({ tags: [], files: { [CHANGELOG_PATH]: "## 2026-11-24\n\n- **Released v0.5.0**\n" } });
    expect(main(["minor"], env.deps)).toBe(0);
    expect(env.store.get(PACKAGE_PATH)).toContain('"version": "0.6.0"');
  });
});

describe("release run", () => {
  it("releases the current version without a bump on the first release", () => {
    const env = setup({ tags: [] });
    expect(main([], env.deps)).toBe(0);
    expect(env.writeFile).toHaveBeenCalledTimes(1);
    expect(env.store.get(CHANGELOG_PATH)).toContain("- **Released v0.5.0**");
    expect(env.store.get(PACKAGE_PATH)).toBe(PACKAGE_TEXT);
  });

  it("bumps on the first release when patch is forced", () => {
    const env = setup({ tags: [] });
    expect(main(["patch"], env.deps)).toBe(0);
    expect(env.store.get(PACKAGE_PATH)).toContain('"version": "0.5.1"');
    expect(env.store.get(CHANGELOG_PATH)).toContain("- **Released v0.5.1**");
  });

  it("suggests patch for fix only entries and writes 0.5.1", () => {
    const env = setup({
      tags: ["v0.5.0"],
      files: { [CHANGELOG_PATH]: "## 2026-11-24\n\n- **Released v0.5.0**\n- Fixed a bug\n\n## 2026-11-16\n\n- Added old\n" },
    });
    expect(main([], env.deps)).toBe(0);
    expect(env.store.get(PACKAGE_PATH)).toContain('"version": "0.5.1"');
    expect(env.store.get(CHANGELOG_PATH)).toBe(
      "## 2026-11-24\n\n- **Released v0.5.0**\n- Fixed a bug\n- **Released v0.5.1**\n\n## 2026-11-16\n\n- Added old\n",
    );
  });

  it("prints no entry list on a first release", () => {
    const env = setup({ tags: [] });
    expect(main([], env.deps)).toBe(0);
    expect(env.out.filter((line) => line.startsWith("  - "))).toHaveLength(0);
  });

  it("dry run reports the same version as the real run and writes nothing", () => {
    const files = { [CHANGELOG_PATH]: "## 2026-11-24\n\n- Fixed a\n" };
    const real = setup({ tags: ["v0.5.0"], files });
    expect(main([], real.deps)).toBe(0);

    const dry = setup({ tags: ["v0.5.0"], files });
    expect(main(["--dry-run"], dry.deps)).toBe(0);
    expect(dry.writeFile).not.toHaveBeenCalled();
    expect(dry.out.join("\n")).not.toMatch(/git (add|commit|push)/);
    expect(versionOf(dry.out)).toBe(versionOf(real.out));
    expect(versionOf(dry.out)).toBe("v0.5.1");
  });
});

describe("tag run", () => {
  it("prints the tag commands without writing anything", () => {
    const env = setup({ tags: [] });
    expect(main(["tag"], env.deps)).toBe(0);
    expect(env.writeFile).not.toHaveBeenCalled();
    expect(env.out.join("\n")).toContain('git tag -a v0.5.0 -m "Release v0.5.0"');
  });

  it("refuses when the tag already exists", () => {
    const env = setup({ tags: ["v0.5.0"] });
    expect(main(["tag"], env.deps)).toBe(1);
  });

  it("completes after a release run on the same fake repo", () => {
    const env = setup({ tags: [] });
    expect(main(["patch"], env.deps)).toBe(0);
    expect(main(["tag"], env.deps)).toBe(0);
    expect(env.out.join("\n")).toContain('git tag -a v0.5.1 -m "Release v0.5.1"');
  });
});
