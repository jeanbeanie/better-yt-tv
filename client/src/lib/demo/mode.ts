// derived from the URL on every call, no cached flag
export function isDemoMode(): boolean {
  const { pathname } = window.location;
  return pathname === "/demo" || pathname.startsWith("/demo/");
}
