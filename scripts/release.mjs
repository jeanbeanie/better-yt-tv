import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGitRunner } from "./release/git.mjs";
import { main } from "./release/run.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function localIsoDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const deps = {
  readFile: (path) => readFileSync(join(root, path), "utf8"),
  writeFile: (path, text) => writeFileSync(join(root, path), text, "utf8"),
  git: createGitRunner(root),
  today: localIsoDate,
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

try {
  process.exitCode = main(process.argv.slice(2), deps);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
