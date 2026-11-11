// fail closed transport for demo mode, every path 404s until a route is added
export const demoFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
