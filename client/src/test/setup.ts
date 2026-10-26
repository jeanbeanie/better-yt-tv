import "@testing-library/jest-dom";
import * as axeMatchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";
import { beforeEach, expect } from "vitest";

// runtime: registers toHaveNoViolations on expect
expect.extend(axeMatchers);

// types: tells tsc expect has toHaveNoViolations
// vitest-axe/extend-expect only covers the old Vi namespace
declare module "vitest" {
  // T must match vitest's own declaration to merge
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});
