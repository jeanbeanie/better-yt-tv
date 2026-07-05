import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});
