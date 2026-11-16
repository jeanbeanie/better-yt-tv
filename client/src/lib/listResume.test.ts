import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readSavedListVideos, saveListVideo, savedListVideoKey } from "./listResume";

const VALID_VIDEO = "dQw4w9WgXcQ";

describe("listResume", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("reads saved videos under the production prefix outside demo", () => {
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-a", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.3f2a9c1e-0000-4000-8000-000000000001", "abcDEF12345");

    expect(readSavedListVideos()).toEqual(
      expect.arrayContaining([
        { listId: "list-a", videoId: VALID_VIDEO },
        { listId: "3f2a9c1e-0000-4000-8000-000000000001", videoId: "abcDEF12345" },
      ]),
    );
    expect(readSavedListVideos()).toHaveLength(2);
  });

  it("reads saved videos under the demo prefix in demo mode and ignores production keys", () => {
    window.history.pushState({}, "", "/demo/lists");
    window.localStorage.setItem("betterYtTv.demo.selectedVideoId.list.demo-list-space-nerd", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-a", "abcDEF12345");

    expect(readSavedListVideos()).toEqual([{ listId: "demo-list-space-nerd", videoId: VALID_VIDEO }]);
  });

  it("ignores the other mode's keys and unrelated keys", () => {
    window.localStorage.setItem("betterYtTv.demo.selectedVideoId.list.list-a", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.selectedListId", "list-a");
    window.localStorage.setItem("betterYtTv.selectedVideoId.all", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.theme", "dark");
    window.localStorage.setItem("betterYtTv.inviteCode", "code-1");

    expect(readSavedListVideos()).toEqual([]);
  });

  it("skips malformed video ids and list ids", () => {
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-short", "short");
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-long", "abcdefghijkl");
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-empty", "");
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-bad", "abc def1234");
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.bad id!", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list.dot", VALID_VIDEO);
    window.localStorage.setItem("betterYtTv.selectedVideoId.list.list-ok", VALID_VIDEO);

    expect(readSavedListVideos()).toEqual([{ listId: "list-ok", videoId: VALID_VIDEO }]);
  });

  it("caps the scan at 100 entries", () => {
    for (let i = 0; i < 150; i++) {
      window.localStorage.setItem(`betterYtTv.selectedVideoId.list.list-${i}`, VALID_VIDEO);
    }

    expect(readSavedListVideos()).toHaveLength(100);
  });

  it("saves under the production key outside demo", () => {
    saveListVideo("list-a", VALID_VIDEO);

    expect(savedListVideoKey("list-a")).toBe("betterYtTv.selectedVideoId.list.list-a");
    expect(window.localStorage.getItem("betterYtTv.selectedVideoId.list.list-a")).toBe(VALID_VIDEO);
    expect(window.localStorage.getItem("betterYtTv.demo.selectedVideoId.list.list-a")).toBeNull();
  });

  it("saves under the demo key in demo mode", () => {
    window.history.pushState({}, "", "/demo/lists");

    saveListVideo("demo-list-space-nerd", VALID_VIDEO);

    expect(window.localStorage.getItem("betterYtTv.demo.selectedVideoId.list.demo-list-space-nerd")).toBe(
      VALID_VIDEO,
    );
    expect(window.localStorage.getItem("betterYtTv.selectedVideoId.list.demo-list-space-nerd")).toBeNull();
  });
});
