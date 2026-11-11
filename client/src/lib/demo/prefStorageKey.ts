import { isDemoMode } from "./mode";

// demo keys use a separate prefix, real preferences stay untouched
export function prefStorageKey(key: string): string {
  if (!isDemoMode()) return key;
  return `betterYtTv.demo.${key.replace(/^betterYtTv\./, "")}`;
}
