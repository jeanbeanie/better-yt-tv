import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AppRoot from "../../AppRoot";
import { getRouterBasename, isDemoMode } from "./mode";
import { resetDemoStore } from "./store";

// first visible fixture title, shown in the player and the queue on /demo/all
const FEED_FIRST_TITLE = "What's New in Blender 5.3! Official Overview";
// second channel's newest video, shown on /demo/all once Blender is off
const NASA_FEED_TITLE = "NASA's SpaceX Crew-13 Mission (Official NASA Trailer)";
// first Dev talk video, newest of the three channels in that list
const DEV_TALK_FIRST_TITLE = "Did Anthropic just save its $1 trillion IPO?";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response("{}", { status: 200 }),
);

function renderShell() {
  return render(
    <BrowserRouter basename={getRouterBasename()}>
      <AppRoot />
    </BrowserRouter>,
  );
}

// flag persists in localStorage, each test sets it explicitly
async function setEditOnCreate(user: UserEvent, on: boolean) {
  const toggle = screen.getByRole("checkbox", { name: "Edit List After Creating" });
  if ((toggle as HTMLInputElement).checked !== on) await user.click(toggle);
}

describe("demo shell", () => {
  beforeEach(() => {
    resetDemoStore();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    window.localStorage.setItem("betterYtTv.theme", "light");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("builds demo nav and footer links under /demo with no network calls", async () => {
    window.history.pushState({}, "", "/demo/all");

    renderShell();

    // wait for the demo shell, Exit demo renders with it
    await screen.findByRole("link", { name: "Exit demo" });
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("href", "/demo/all");
    expect(within(nav).getByRole("link", { name: "Lists" })).toHaveAttribute("href", "/demo/lists");
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/demo/settings",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/demo");
    expect(within(nav).queryByRole("link", { name: "Streams" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exit demo" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();

    // demo feed loads from the in memory store on the All page
    await screen.findAllByText(FEED_FIRST_TITLE);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("keeps in app navigation under /demo when clicking Lists", async () => {
    window.history.pushState({}, "", "/demo/all");
    const user = userEvent.setup();

    renderShell();

    await user.click(await screen.findByRole("link", { name: "Lists" }));

    await waitFor(() => expect(window.location.pathname).toBe("/demo/lists"));
    expect(isDemoMode()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("renders the demo home at /demo with no network calls", async () => {
    window.history.pushState({}, "", "/demo");
    window.localStorage.setItem("betterYtTv.inviteCode", "code-1");

    renderShell();

    const demoLink = await screen.findByRole("link", { name: "Go to /all videos" });
    expect(demoLink).toHaveAttribute("href", "/demo/all");
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByText(/requires an invite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/logged in as/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("calls the real fetch for whoami outside demo", async () => {
    window.history.pushState({}, "", "/");
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ user: null }), { status: 200 }),
    );

    renderShell();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/auth/whoami");
  });

  it("shows only Channels and Lists in the demo settings nav", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");

    renderShell();

    const settingsNav = await screen.findByRole("link", { name: "Channels" }).then(
      () => screen.getAllByRole("navigation").find((nav) => within(nav).queryByRole("link", { name: "Channels" })),
    );
    if (!settingsNav) throw new Error("settings nav not found");
    expect(within(settingsNav).getByRole("link", { name: "Channels" })).toHaveAttribute(
      "href",
      "/demo/settings/channels",
    );
    expect(within(settingsNav).getByRole("link", { name: "Lists" })).toHaveAttribute(
      "href",
      "/demo/settings/lists",
    );
    expect(within(settingsNav).queryByRole("link", { name: "Advanced" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("has no advanced settings route in demo", async () => {
    window.history.pushState({}, "", "/demo/settings/advanced");

    renderShell();

    await screen.findByRole("link", { name: "Exit demo" });
    expect(screen.queryByRole("button", { name: "Delete my account and data" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it.each(["/demo", "/demo/all", "/demo/lists", "/demo/settings/channels"])(
    "renders the demo banner with contact links at %s",
    async (path) => {
      window.history.pushState({}, "", path);

      renderShell();

      await screen.findByRole("link", { name: "Exit demo" });
      expect(screen.getByText(/You're viewing a demo with sample data\. Want an invite\?/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
        "href",
        "https://github.com/jeanbeanie",
      );
      expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
        "href",
        "https://www.linkedin.com/in/jeane-ramos-83339399/",
      );
      expect(fetchMock).toHaveBeenCalledTimes(0);
    },
  );

  it.each(["/demo/live", "/demo/admin"])("renders no Live or Admin page at %s", async (path) => {
    window.history.pushState({}, "", path);

    renderShell();

    await screen.findByRole("link", { name: "Exit demo" });
    expect(screen.queryByRole("heading", { name: "Live Streams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("toggles the theme from the demo nav and persists it to the shared key", async () => {
    window.history.pushState({}, "", "/demo/all");
    const user = userEvent.setup();

    renderShell();

    await user.click(await screen.findByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("betterYtTv.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it.each([
    ["/demo/all", FEED_FIRST_TITLE],
    ["/demo/lists", "Space nerd"],
    ["/demo/settings/channels", "NASA"],
    ["/demo/settings/lists", "Space nerd"],
  ])(
    "writes only the shared theme key and demo keys at %s",
    async (path, expectedText) => {
      window.history.pushState({}, "", path);

      renderShell();

      await screen.findAllByText(expectedText);
      const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i) ?? "");
      expect(keys.filter((key) => key !== "betterYtTv.theme" && !key.startsWith("betterYtTv.demo."))).toEqual([]);
      expect(
        keys.filter(
          (key) =>
            ["betterYtTv.catchUpMode", "betterYtTv.selectedListId", "betterYtTv.editOnCreate", "betterYtTv.lastAutoRefreshAt"].includes(key) ||
            key.startsWith("betterYtTv.selectedVideoId."),
        ),
      ).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    },
  );

  it("writes the demo catch-up and edit-on-create keys on mount", async () => {
    window.history.pushState({}, "", "/demo/all");
    const first = renderShell();

    await screen.findAllByText(FEED_FIRST_TITLE);
    expect(window.localStorage.getItem("betterYtTv.demo.catchUpMode")).not.toBeNull();
    first.unmount();

    window.history.pushState({}, "", "/demo/settings/lists");
    renderShell();

    await screen.findByText("Space nerd");
    expect(window.localStorage.getItem("betterYtTv.demo.editOnCreate")).not.toBeNull();
  });

  it("marks a queue video watched through the UI and shows it watched after the refresh", async () => {
    window.history.pushState({}, "", "/demo/all");
    const user = userEvent.setup();

    renderShell();

    await user.click(
      await screen.findByRole("button", { name: `Mark "${FEED_FIRST_TITLE}" as watched` }),
    );

    await screen.findByRole("button", { name: `Mark "${FEED_FIRST_TITLE}" as unwatched` });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("lists the fixture channels and shows sync and refresh results", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const user = userEvent.setup();

    renderShell();

    await screen.findByRole("heading", { name: "NASA" });
    expect(screen.getAllByText(/^demo-/)).toHaveLength(11);

    await user.click(screen.getByRole("button", { name: "Sync Subscriptions" }));
    await screen.findByText("Synced 11 channels.");

    await user.click(screen.getByRole("button", { name: "Manually Refresh Feed" }));
    await screen.findByText("Refreshed 11 channels, skipped 0, cached 60 videos.");

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("hides a channel's videos on All after switching it off in Channels", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const user = userEvent.setup();

    renderShell();

    await screen.findByRole("heading", { name: "Blender" });
    const blender = screen.getByRole("group", { name: "Settings for Blender" });
    const enableAll = within(blender).getByRole("checkbox", { name: "Enable in All" });
    await user.click(enableAll);
    // wait for the save to finish so the store has the change before All loads
    await waitFor(() => expect(enableAll).not.toBeChecked());
    await waitFor(() => expect(enableAll).toBeEnabled());

    await user.click(screen.getByRole("link", { name: "All" }));

    await screen.findAllByText(NASA_FEED_TITLE);
    expect(screen.queryAllByText(FEED_FIRST_TITLE)).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("switches every channel off with the bulk control and restores the feed when it is flipped back", async () => {
    window.history.pushState({}, "", "/demo/settings/channels");
    const user = userEvent.setup();

    renderShell();

    await screen.findByRole("heading", { name: "NASA" });
    const bulkAll = screen.getByRole("checkbox", { name: "Include in All" });
    await waitFor(() => expect(bulkAll).toBeEnabled());
    await user.click(bulkAll);
    await waitFor(() => expect(bulkAll).toBeEnabled());

    const rowAll = screen.getAllByRole("checkbox", { name: "Enable in All" });
    expect(rowAll).toHaveLength(11);
    for (const box of rowAll) expect(box).not.toBeChecked();

    await user.click(screen.getByRole("link", { name: "All" }));
    await screen.findByText(/No videos yet/);
    expect(screen.queryAllByText(FEED_FIRST_TITLE)).toHaveLength(0);

    await user.click(screen.getByRole("link", { name: "Settings" }));
    await user.click(await screen.findByRole("checkbox", { name: "Include in All" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Include in All" })).toBeEnabled());
    for (const box of screen.getAllByRole("checkbox", { name: "Enable in All" })) {
      expect(box).toBeChecked();
    }

    await user.click(screen.getByRole("link", { name: "All" }));
    await screen.findAllByText(FEED_FIRST_TITLE);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows the Space nerd feed on /demo/lists with no network calls", async () => {
    window.history.pushState({}, "", "/demo/lists");

    renderShell();

    expect(await screen.findByRole("combobox")).toHaveValue("demo-list-space-nerd");
    await screen.findByText(NASA_FEED_TITLE);
    expect(screen.queryByText(FEED_FIRST_TITLE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("switches the lists feed when another list is picked", async () => {
    window.history.pushState({}, "", "/demo/lists");
    const user = userEvent.setup();

    renderShell();

    await user.selectOptions(await screen.findByRole("combobox"), "demo-list-dev-talk");

    await screen.findAllByText(DEV_TALK_FIRST_TITLE);
    expect(screen.queryByText(NASA_FEED_TITLE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("lists the three demo lists with their channel counts", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");

    renderShell();

    await screen.findByText("Space nerd");
    expect(screen.getByText("Dev talk")).toBeInTheDocument();
    expect(screen.getByText("Quick learning")).toBeInTheDocument();
    expect(screen.getByText("5 channels")).toBeInTheDocument();
    expect(screen.getAllByText("3 channels")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows the channels of a list in the editor in title order", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");

    renderShell();

    const heading = await screen.findByRole("heading", { name: "Channels in this list" });
    const section = heading.parentElement as HTMLElement;
    await waitFor(() =>
      expect(within(section).getAllByText(/^(Computerphile|exit node|Fireship)$/)).toHaveLength(3),
    );
    const titles = within(section).getAllByText(/^(Computerphile|exit node|Fireship)$/);
    expect(titles.map((el) => el.textContent)).toEqual(["Computerphile", "exit node", "Fireship"]);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows the not found state for an unknown list id in the editor", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-missing");

    renderShell();

    await screen.findByText("List not found.");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("creates a list on the settings page with edit-after-create off", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");
    const user = userEvent.setup();
    renderShell();
    await screen.findByText("Space nerd");
    await setEditOnCreate(user, false);

    await user.type(screen.getByRole("textbox", { name: "New list name" }), "Road trip");
    await user.click(screen.getByRole("button", { name: "Create new list" }));

    await screen.findByText("Road trip");
    expect(screen.getByText("0 channels")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/demo/settings/lists");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows the duplicate name error and adds no second row", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");
    const user = userEvent.setup();
    renderShell();
    await screen.findByText("Space nerd");
    await setEditOnCreate(user, false);

    await user.type(screen.getByRole("textbox", { name: "New list name" }), "Space nerd");
    await user.click(screen.getByRole("button", { name: "Create new list" }));

    await screen.findByText("You already have a list with this name.");
    expect(screen.getAllByText("Space nerd")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("deletes a list after confirm and keeps the other lists", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      renderShell();
      const devTalk = (await screen.findByRole("link", { name: "Dev talk" })).closest("li") as HTMLElement;

      await user.click(within(devTalk).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(screen.queryByRole("link", { name: "Dev talk" })).toBeNull());
    } finally {
      confirm.mockRestore();
    }
    expect(screen.getByRole("link", { name: "Space nerd" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quick learning" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("opens the editor for a new list when edit-after-create is on", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");
    const user = userEvent.setup();
    renderShell();
    await screen.findByText("Space nerd");
    await setEditOnCreate(user, true);

    await user.type(screen.getByRole("textbox", { name: "New list name" }), "Road trip");
    await user.click(screen.getByRole("button", { name: "Create new list" }));

    await waitFor(() => expect(window.location.pathname).toBe("/demo/settings/lists/demo-list-1"));
    expect(await screen.findByRole("textbox", { name: "List name" })).toHaveValue("Road trip");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("saves a rename and an added channel, then shows them on the settings lists", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");
    const user = userEvent.setup();
    const first = renderShell();
    const nameInput = await screen.findByRole("textbox", { name: "List name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Dev talk plus");
    await user.type(
      screen.getByRole("textbox", { name: "Search your subscribed channels" }),
      "Blender",
    );
    await user.click(await screen.findByRole("button", { name: "Add Blender" }));
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);
    await screen.findAllByText("Saved");
    first.unmount();

    window.history.pushState({}, "", "/demo/settings/lists");
    renderShell();
    const link = await screen.findByRole("link", { name: "Dev talk plus" });
    expect(within(link.closest("li") as HTMLElement).getByText("4 channels")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dev talk" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows an added channel's videos and drops a removed channel's from the list feed", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");
    const user = userEvent.setup();
    const first = renderShell();
    const section = (await screen.findByRole("heading", { name: "Channels in this list" }))
      .parentElement as HTMLElement;
    const fireshipRow = (await within(section).findByText("Fireship")).parentElement as HTMLElement;
    await user.click(within(fireshipRow).getByRole("button", { name: "Remove" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search your subscribed channels" }),
      "Blender",
    );
    await user.click(await screen.findByRole("button", { name: "Add Blender" }));
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);
    await screen.findAllByText("Saved");
    first.unmount();

    window.history.pushState({}, "", "/demo/lists");
    renderShell();
    await user.selectOptions(await screen.findByRole("combobox"), "demo-list-dev-talk");
    await screen.findAllByText("Mutex Explained - Computerphile");
    await screen.findAllByText("Making of: The Blender Open Movies Exhibition");
    expect(screen.queryByText(DEV_TALK_FIRST_TITLE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("shows the duplicate name error on save and keeps the saved name and channels", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");
    const user = userEvent.setup();
    const first = renderShell();
    const nameInput = await screen.findByRole("textbox", { name: "List name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Space nerd");
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);
    await screen.findAllByText("You already have a list with this name.");
    first.unmount();

    window.history.pushState({}, "", "/demo/settings/lists");
    renderShell();
    const devTalk = (await screen.findByRole("link", { name: "Dev talk" })).closest("li") as HTMLElement;
    expect(within(devTalk).getByText("3 channels")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Space nerd" })).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("creates a list, adds a channel in its editor, and shows only that channel in the list feed", async () => {
    window.history.pushState({}, "", "/demo/settings/lists");
    const user = userEvent.setup();
    const first = renderShell();
    await screen.findByText("Space nerd");
    await setEditOnCreate(user, true);

    await user.type(screen.getByRole("textbox", { name: "New list name" }), "Road trip");
    await user.click(screen.getByRole("button", { name: "Create new list" }));
    await waitFor(() => expect(window.location.pathname).toBe("/demo/settings/lists/demo-list-1"));
    await screen.findByRole("textbox", { name: "List name" });

    await user.type(
      screen.getByRole("textbox", { name: "Search your subscribed channels" }),
      "NASA",
    );
    await user.click(await screen.findByRole("button", { name: "Add NASA" }));
    await user.click(screen.getAllByRole("button", { name: "Save list" })[0]);
    await screen.findAllByText("Saved");
    first.unmount();

    window.history.pushState({}, "", "/demo/lists");
    renderShell();
    await user.selectOptions(await screen.findByRole("combobox"), "demo-list-1");
    await screen.findAllByText(NASA_FEED_TITLE);
    expect(screen.queryByText(FEED_FIRST_TITLE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("deletes a list from its editor and lands on the lists settings page without it", async () => {
    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const first = renderShell();
      await screen.findByRole("textbox", { name: "List name" });
      await user.click(screen.getByRole("button", { name: "Delete list" }));

      await waitFor(() => expect(window.location.pathname).toBe("/demo/settings/lists"));
      expect(await screen.findByRole("link", { name: "Space nerd" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Dev talk" })).toBeNull();
      expect(screen.getByRole("link", { name: "Quick learning" })).toBeInTheDocument();
      expect(confirm).toHaveBeenCalledTimes(1);
      first.unmount();
    } finally {
      confirm.mockRestore();
    }

    window.history.pushState({}, "", "/demo/settings/lists/demo-list-dev-talk");
    renderShell();
    await screen.findByText("List not found.");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("falls back to the first list on /demo/lists after the selected list is deleted", async () => {
    window.history.pushState({}, "", "/demo/lists");
    const user = userEvent.setup();
    const first = renderShell();
    await user.selectOptions(await screen.findByRole("combobox"), "demo-list-dev-talk");
    await screen.findAllByText(DEV_TALK_FIRST_TITLE);
    first.unmount();

    window.history.pushState({}, "", "/demo/settings/lists");
    const second = renderShell();
    const devTalk = (await screen.findByRole("link", { name: "Dev talk" })).closest("li") as HTMLElement;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      await user.click(within(devTalk).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByRole("link", { name: "Dev talk" })).toBeNull());
    } finally {
      confirm.mockRestore();
    }
    second.unmount();

    window.history.pushState({}, "", "/demo/lists");
    renderShell();
    expect(await screen.findByRole("combobox")).toHaveValue("demo-list-space-nerd");
    await screen.findByText(NASA_FEED_TITLE);
    expect(screen.queryByText(/failed to load|not found/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
