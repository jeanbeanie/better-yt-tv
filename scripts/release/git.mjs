import { execFileSync } from "node:child_process";

// read only git calls the release script may make
export function assertReadOnlyGit(args) {
  const [subcommand, ...rest] = args;
  const allowed =
    (subcommand === "status" && rest.length === 1 && rest[0] === "--porcelain") ||
    (subcommand === "branch" && rest.length === 1 && rest[0] === "--show-current") ||
    (subcommand === "tag" && rest[0] === "-l" && rest.slice(1).every((arg) => !arg.startsWith("-")));
  if (!allowed) throw new Error(`Blocked git call, release script is read only: git ${args.join(" ")}`);
}

export function createGitRunner(root) {
  return (args) => {
    assertReadOnlyGit(args);
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
  };
}
