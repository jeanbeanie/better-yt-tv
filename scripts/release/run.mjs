import { addReleaseMarker, entriesSinceLastRelease, hasReleaseMarker, suggestBump } from "./changelog.mjs";
import {
  bumpVersion,
  compareVersions,
  isVersion,
  readPackageVersion,
  setPackageVersion,
  tagName,
} from "./version.mjs";

export const PACKAGE_PATH = "package.json";
export const CHANGELOG_PATH = "client/public/changelog.md";

const BUMP_KINDS = ["minor", "patch"];
const USAGE = "Usage: pnpm release [minor|patch] [--dry-run]\n       pnpm release:tag";

// deps: readFile(path), writeFile(path, text), git(args), today(), log(line), error(line)
// paths are relative to the repo root
export function main(argv, deps) {
  if (argv[0] === "tag") return argv.length === 1 ? runTag(deps) : fail(deps, USAGE);

  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter((arg) => arg !== "--dry-run");
  if (positional.length > 1 || (positional.length === 1 && !BUMP_KINDS.includes(positional[0]))) {
    return fail(deps, USAGE);
  }
  return runRelease({ force: positional[0] ?? null, dryRun }, deps);
}

function fail(deps, message) {
  deps.error(message);
  return 1;
}

function listTags(git) {
  return git(["tag", "-l", "v*"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function highestTag(tags) {
  return tags
    .filter((tag) => isVersion(tag.slice(1)))
    .map((tag) => tag.slice(1))
    .reduce((best, version) => (best === null || compareVersions(version, best) > 0 ? version : best), null);
}

function runRelease({ force, dryRun }, deps) {
  const { readFile, writeFile, git, today, log } = deps;

  const branch = git(["branch", "--show-current"]).trim();
  if (branch === "") return fail(deps, "Detached HEAD. Check out a release branch first.");
  if (branch === "main") return fail(deps, "Refusing to release from main. Switch to a release branch first.");
  if (git(["status", "--porcelain"]).trim() !== "") {
    return fail(deps, "Working tree is dirty. Commit or stash your changes first.");
  }

  const packageText = readFile(PACKAGE_PATH);
  const current = readPackageVersion(packageText);
  const changelogText = readFile(CHANGELOG_PATH);
  const tags = listTags(git);
  const entries = entriesSinceLastRelease(changelogText);

  let next;
  let reason;
  if (force) {
    next = bumpVersion(current, force);
    reason = `forced ${force}`;
  } else if (!tags.includes(tagName(current))) {
    if (hasReleaseMarker(changelogText, current)) {
      return fail(deps, `Release ${tagName(current)} was already prepared. After the PR is merged and the deploy is healthy, run pnpm release:tag.`);
    }
    next = current;
    reason = "first release, no bump";
  } else if (entries.length === 0) {
    return fail(deps, "No entries since the last release marker. Nothing to release.");
  } else {
    const kind = suggestBump(entries);
    next = bumpVersion(current, kind);
    reason = `suggested ${kind}`;
  }

  const highest = highestTag(tags);
  if (highest !== null && compareVersions(next, highest) <= 0) {
    return fail(deps, `${tagName(next)} is not greater than the latest tag ${tagName(highest)}.`);
  }

  const bumped = next !== current;
  const change = bumped ? `${current} -> ${next}` : next;
  log(`Release ${tagName(next)}: version ${change} (${reason})`);
  if (bumped) {
    log(`Entries since the last release marker: ${entries.length}`);
    for (const entry of entries) log(`  - ${entry}`);
  }

  if (dryRun) {
    log("Preview only, nothing was written.");
    log("Run without --dry-run to apply.");
    return 0;
  }

  if (bumped) writeFile(PACKAGE_PATH, setPackageVersion(packageText, next));
  writeFile(CHANGELOG_PATH, addReleaseMarker(changelogText, next, today()));
  log(`Updated ${bumped ? `${PACKAGE_PATH} and ` : ""}${CHANGELOG_PATH}`);
  log("Run these yourself, the script does not run git:");
  printReleaseCommands(log, branch, next, bumped);
  return 0;
}

function printReleaseCommands(log, branch, version, bumped) {
  const files = bumped ? `${PACKAGE_PATH} ${CHANGELOG_PATH}` : CHANGELOG_PATH;
  log(`  git add ${files}`);
  log(`  git commit -m "Release ${tagName(version)}"`);
  log(`  git push -u origin ${branch}`);
  log("After the PR is merged and the deploy is healthy, run git switch main and git pull, then pnpm release:tag.");
}

function runTag(deps) {
  const { readFile, git, log } = deps;
  const tag = tagName(readPackageVersion(readFile(PACKAGE_PATH)));
  if (listTags(git).includes(tag)) return fail(deps, `Tag ${tag} already exists.`);

  log("The tag name comes from the checked out package.json. Run git switch main and git pull first.");
  log("Run these yourself, the script does not run git:");
  log("  git log -1 --oneline");
  log("  # confirm the last commit is the release PR merge commit before tagging");
  log(`  git tag -a ${tag} -m "Release ${tag}"`);
  log(`  git push origin ${tag}`);
  log("The tag message can be edited before you run the tag command.");
  return 0;
}
