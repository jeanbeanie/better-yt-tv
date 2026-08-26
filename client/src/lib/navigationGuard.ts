import type { MouseEvent } from "react";

const DEFAULT_MESSAGE = "You have unsaved changes. Leave this page?";

type DirtyCheck = () => boolean;

// whichever page is on screen registers its dirty check here
let dirtyCheck: DirtyCheck | null = null;

export function setNavigationGuard(fn: DirtyCheck | null) {
  dirtyCheck = fn;
}

// only clears when the check passed in is still the active one
// so an old page unmounting late can't wipe a newer page's guard
export function clearNavigationGuard(fn: DirtyCheck) {
  if (dirtyCheck === fn) dirtyCheck = null;
}

// true means safe to navigate, false means the user cancelled
export function isNavigationAllowed(message = DEFAULT_MESSAGE): boolean {
  if (!dirtyCheck?.()) return true;
  return window.confirm(message);
}

// warns on tab close or refresh while dirty
window.addEventListener("beforeunload", (e) => {
  if (dirtyCheck?.()) {
    e.preventDefault();
    e.returnValue = ""; // chrome needs this set to show the prompt
  }
});

// shared onClick wrapper for GuardedLink and GuardedNavLink
export function guardClick(onClick?: (event: MouseEvent<HTMLAnchorElement>) => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isNavigationAllowed()) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}
