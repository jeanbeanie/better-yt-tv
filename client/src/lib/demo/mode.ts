// derived from the URL on every call, no cached flag
export function isDemoMode(): boolean {
  const { pathname } = window.location;
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

// router basename, so in app links resolve under /demo in demo
export function getRouterBasename(): string {
  return isDemoMode() ? "/demo" : "/";
}
