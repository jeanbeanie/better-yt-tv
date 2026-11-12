import type { ChannelPatch } from "./store";

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

// no network, the count comes from the store so it cannot drift from the fixtures
async function syncSubscriptions(): Promise<Response> {
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

const routes: Route[] = [
  { method: "GET", pattern: compilePattern("/api/feed/all"), handle: getFeedAll },
  { method: "POST", pattern: compilePattern("/api/feed/videos/:videoId/watch"), handle: markWatched },
  { method: "POST", pattern: compilePattern("/api/feed/videos/:videoId/unwatch"), handle: markUnwatched },
  { method: "GET", pattern: compilePattern("/api/channels"), handle: getChannels },
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
