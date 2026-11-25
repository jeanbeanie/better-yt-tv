import { describe, expect, it } from "vitest";
import { addReleaseMarker, entriesSinceLastRelease, suggestBump } from "./changelog.mjs";

describe("changelog helpers", () => {
  it("counts a bullet appended below the marker in the same section", () => {
    const entries = entriesSinceLastRelease("## 2026-11-24\n\n- **Released v0.5.0**\n- Fixed a bug\n");
    expect(entries).toEqual(["Fixed a bug"]);
    expect(suggestBump(entries)).toBe("patch");
  });

  it("ignores bullets above the marker in the same section", () => {
    const text = "## 2026-11-24\n\n- Added a new thing\n- **Released v0.5.0**\n";
    expect(entriesSinceLastRelease(text)).toEqual([]);
  });

  it("counts every bullet in a newer section above the marker", () => {
    const text = [
      "## 2026-11-24",
      "",
      "- Added new",
      "- Fixed newer",
      "",
      "## 2026-11-16",
      "",
      "- Fixed old",
      "- **Released v0.5.0**",
      "- Fixed below",
      "",
    ].join("\n");
    expect(entriesSinceLastRelease(text)).toEqual(["Added new", "Fixed newer", "Fixed below"]);
  });

  it("uses only the newest marker when an older marker sits further down", () => {
    const text = [
      "## 2026-11-24",
      "",
      "- Fixed a",
      "- **Released v0.5.1**",
      "",
      "## 2026-11-16",
      "",
      "- Added b",
      "- **Released v0.5.0**",
      "",
      "## 2026-11-10",
      "",
      "- Added c",
      "",
    ].join("\n");
    expect(entriesSinceLastRelease(text)).toEqual([]);
  });

  it("counts every bullet when there is no marker", () => {
    const text = "## 2026-11-24\n\n- Added a\n- Fixed b\n";
    expect(entriesSinceLastRelease(text)).toEqual(["Added a", "Fixed b"]);
  });

  it("gives minor for feature verbs", () => {
    for (const entry of ["Added x", "Changed x", "Renamed x", "Moved x"]) {
      expect(suggestBump([entry])).toBe("minor");
    }
  });

  it("gives patch when every entry is a fix or behind the scenes", () => {
    expect(suggestBump(["Fixed x", "Behind the scenes: tidied x"])).toBe("patch");
  });

  it("gives minor when fixes are mixed with a feature", () => {
    expect(suggestBump(["Fixed x", "Added y"])).toBe("minor");
  });

  it("gives minor for an unlisted verb", () => {
    expect(suggestBump(["Removed x"])).toBe("minor");
  });

  it("appends the marker after the last bullet of today's section", () => {
    const text = [
      "## 2026-11-24",
      "",
      "- Added a",
      "- Fixed b",
      "",
      "## 2026-11-16",
      "",
      "- Added c",
      "",
    ].join("\n");
    const expected = [
      "## 2026-11-24",
      "",
      "- Added a",
      "- Fixed b",
      "- **Released v0.5.1**",
      "",
      "## 2026-11-16",
      "",
      "- Added c",
      "",
    ].join("\n");
    expect(addReleaseMarker(text, "0.5.1", "2026-11-24")).toBe(expected);
  });

  it("adds a new top section holding only the marker when the top date is not today", () => {
    const text = "## 2026-11-16\n\n- Added c\n";
    const expected = "## 2026-11-24\n\n- **Released v0.5.0**\n\n## 2026-11-16\n\n- Added c\n";
    expect(addReleaseMarker(text, "0.5.0", "2026-11-24")).toBe(expected);
  });
});
