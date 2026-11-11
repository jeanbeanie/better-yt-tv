function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const routes: Record<string, () => Response> = {};

// fail closed transport for demo mode, unknown routes 404
export const demoFetch: typeof fetch = async (input, init) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const { pathname } = new URL(rawUrl, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  const route = routes[`${method} ${pathname}`];
  return route ? route() : json({ error: "Not found" }, 404);
};
