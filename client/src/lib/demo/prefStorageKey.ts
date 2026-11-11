import { isDemoMode } from "./mode";

// demo keys live under a separate prefix so real preferences stay untouched
export function prefStorageKey(key: string): string {
  if (!isDemoMode()) return key;
  return `betterYtTv.demo.${key.replace(/^betterYtTv\./, "")}`;
}
