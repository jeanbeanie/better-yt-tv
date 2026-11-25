import { readFileSync } from "node:fs";

// same depth from src/lib and dist/lib
const pkg = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { version: string };

export const APP_VERSION = `v${pkg.version}`;
