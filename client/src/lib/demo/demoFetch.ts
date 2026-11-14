import type { ChannelPatch } from "./store";
import { DEMO_SYNC_DELAY_MS, demoLatency } from "./latency";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type RouteContext = { url: URL; params: Record<string, string>; body: unknown };

type Route = {
  method: string;
  pattern: RegExp;
  handle: (ctx: RouteContext) => Response | Promise<Response>;
};

// "/api/feed/videos/:videoId/watch" -> RegExp with a named group per param
function compilePattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);
}

// mirrors parsePagination in server/src/routes/feed.ts
function parsePagination(params: URLSearchParams) {
  const rawOffset = Number(params.get("offset"));
  const rawLimit = Number(params.get("limit"));

  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50;

  return { offset, limit: Math.min(limit, 200) };
}

// dynamic import keeps store and fixtures in their own chunk
// a static import would pull them into the main bundle through api.ts
async function getFeedAll({ url }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  return json(getDemoStore().getAllFeed(parsePagination(url.searchParams)));
}

// dynamic import, same chunk split as getFeedAll
async function markWatched({ params }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  getDemoStore().setWatched(params.videoId);
  return json({ ok: true });
}

async function markUnwatched({ params }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  getDemoStore().setUnwatched(params.videoId);
  return json({ ok: true });
}

// dynamic import, same chunk split as getFeedAll, keeps fixtures out of the index chunk
async function getChannels(): Promise<Response> {
  const { getDemoStore } = await import("./store");
  return json({ channels: getDemoStore().getChannels() });
}

// no network, count comes from the store and matches the fixtures
// waits first so the busy state shows
async function syncSubscriptions(): Promise<Response> {
  await demoLatency(DEMO_SYNC_DELAY_MS);
  const { getDemoStore } = await import("./store");
  return json({ ok: true, syncedCount: getDemoStore().getChannels().length });
}

// shared by both PATCH handlers
function hasBooleanField(fields: ChannelPatch): boolean {
  return [fields.enabledAll, fields.enabledLive, fields.excludedShorts].some(
    (value) => typeof value === "boolean",
  );
}

// dynamic import, same chunk split as getFeedAll
// non-object bodies count as empty, so they get the 400
async function patchChannel({ params, body }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const fields = (typeof body === "object" && body !== null ? body : {}) as ChannelPatch;
  if (!hasBooleanField(fields)) return json({ error: "No valid fields to update" }, 400);
  // store ignores non-boolean values
  const channel = getDemoStore().updateChannel(params.channelId, fields);
  if (!channel) return json({ error: "Channel preferences not found" }, 404);
  return json({ channel });
}

// dynamic import, same chunk split as getFeedAll
// channelIds is checked before the fields, like the server
async function patchChannelsBulk({ body }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const raw = typeof body === "object" && body !== null ? body : {};
  const channelIds = "channelIds" in raw ? raw.channelIds : undefined;
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return json({ error: "channelIds is required" }, 400);
  }
  const fields = raw as ChannelPatch;
  if (!hasBooleanField(fields)) return json({ error: "No valid fields to update" }, 400);
  // ids that match no channel are skipped by the store
  const updatedCount = getDemoStore().updateChannels(channelIds, fields);
  return json({ ok: true, updatedCount });
}

// dynamic import, same chunk split as getFeedAll
async function getLists(): Promise<Response> {
  const { getDemoStore } = await import("./store");
  return json({ lists: getDemoStore().getLists() });
}

// dynamic import, same chunk split as getFeedAll
async function getList({ params }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const list = getDemoStore().getList(params.listId);
  if (!list) return json({ error: "List not found" }, 404);
  return json({ list });
}

// dynamic import, same chunk split as getFeedAll
// same pagination as /all, body shape matches the server
async function getListFeed({ url, params }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const feed = getDemoStore().getListFeed(params.listId, parsePagination(url.searchParams));
  if (!feed) return json({ error: "List not found" }, 404);
  return json(feed);
}

// list name rules, same messages and order as the server
const LIST_NAME_MAX_LENGTH = 100;

// trims first, non string counts as empty
// checked in order: required, then length
function validateListName(raw: unknown): { name: string } | { error: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { error: "Name is required" };
  if (name.length > LIST_NAME_MAX_LENGTH) {
    return { error: `Name must be ${LIST_NAME_MAX_LENGTH} characters or fewer` };
  }
  return { name };
}

// dynamic import, same chunk split as getFeedAll
// non-object bodies count as empty, they get the 400
async function createList({ body }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const fields = (typeof body === "object" && body !== null ? body : {}) as { name?: unknown };
  const result = validateListName(fields.name);
  if ("error" in result) return json({ error: result.error }, 400);
  const list = getDemoStore().createList(result.name);
  // duplicate check runs after the name rules
  if (!list) return json({ error: "You already have a list with this name." }, 409);
  return json({ list }, 201);
}

// dynamic import, same chunk split as getFeedAll
async function deleteList({ params }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  if (!getDemoStore().deleteList(params.listId)) return json({ error: "List not found" }, 404);
  return json({ ok: true });
}

// dynamic import, same chunk split as getFeedAll
// order: unknown id 404, then name, then channelIds, then the duplicate check in the store
async function saveList({ params, body }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  const store = getDemoStore();
  if (!store.getList(params.listId)) return json({ error: "List not found" }, 404);
  // non-object bodies count as empty, they get the 400
  const fields = (typeof body === "object" && body !== null ? body : {}) as {
    name?: unknown;
    channelIds?: unknown;
  };
  const result = validateListName(fields.name);
  if ("error" in result) return json({ error: result.error }, 400);
  if (!Array.isArray(fields.channelIds)) {
    return json({ error: "channelIds must be an array" }, 400);
  }
  const saved = store.saveList(params.listId, result.name, fields.channelIds);
  if ("error" in saved) {
    if (saved.error === "duplicate") {
      return json({ error: "You already have a list with this name." }, 409);
    }
    return json({ error: "List not found" }, 404);
  }
  return json({ list: saved.list });
}

const routes: Route[] = [
  { method: "GET", pattern: compilePattern("/api/feed/all"), handle: getFeedAll },
  { method: "POST", pattern: compilePattern("/api/feed/videos/:videoId/watch"), handle: markWatched },
  { method: "POST", pattern: compilePattern("/api/feed/videos/:videoId/unwatch"), handle: markUnwatched },
  { method: "GET", pattern: compilePattern("/api/channels"), handle: getChannels },
  { method: "GET", pattern: compilePattern("/api/lists"), handle: getLists },
  { method: "GET", pattern: compilePattern("/api/lists/:listId"), handle: getList },
  { method: "GET", pattern: compilePattern("/api/feed/lists/:listId"), handle: getListFeed },
  { method: "POST", pattern: compilePattern("/api/lists"), handle: createList },
  { method: "DELETE", pattern: compilePattern("/api/lists/:listId"), handle: deleteList },
  { method: "PUT", pattern: compilePattern("/api/lists/:listId"), handle: saveList },
  { method: "POST", pattern: compilePattern("/api/youtube/sync-subscriptions"), handle: syncSubscriptions },
  { method: "PATCH", pattern: compilePattern("/api/channels/bulk"), handle: patchChannelsBulk },
  // bulk routes must stay above this entry
  { method: "PATCH", pattern: compilePattern("/api/channels/:channelId"), handle: patchChannel },
];

// unparseable JSON counts as an empty object
function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// fail closed transport for demo mode, unknown routes 404
export const demoFetch: typeof fetch = async (input, init) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(rawUrl, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init?.body);
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(url.pathname);
    if (match) return route.handle({ url, params: { ...match.groups }, body });
  }
  return json({ error: "Not found" }, 404);
};
