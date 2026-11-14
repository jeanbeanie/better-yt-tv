// fake network time for the demo actions that would call the server
export const DEMO_SYNC_DELAY_MS = 2000;
export const DEMO_REFRESH_DELAY_MS = 3500;

export function demoLatency(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
