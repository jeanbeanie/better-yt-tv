function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type RouteContext = { url: URL; params: Record<string, string> };

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

// dynamic so store and fixtures split into their own chunk, a static import
// here would pull them into the main bundle through api.ts
async function getFeedAll({ url }: RouteContext): Promise<Response> {
  const { getDemoStore } = await import("./store");
  return json(getDemoStore().getAllFeed(parsePagination(url.searchParams)));
}

const routes: Route[] = [{ method: "GET", pattern: compilePattern("/api/feed/all"), handle: getFeedAll }];

// fail closed transport for demo mode, unknown routes 404
export const demoFetch: typeof fetch = async (input, init) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(rawUrl, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(url.pathname);
    if (match) return route.handle({ url, params: { ...match.groups } });
  }
  return json({ error: "Not found" }, 404);
};
