# Contributing

This is a personal project, but issues and pull requests are welcome.

## Getting set up

See the "Getting started" section of the [README](README.md) for
installing dependencies, setting up environment files, and running the
app locally.

## Running checks

Each workspace has its own lint, build, and test commands:

```bash
pnpm --filter client lint
pnpm --filter client build
pnpm --filter client test

pnpm --filter server lint
pnpm --filter server build
pnpm --filter server test
```

See the "Scripts" table in the README for the full list.

## Releasing

A release is a `vX.Y.Z` git tag that marks which version of the app is live. It is a marker for whoever owns what is live, not a stability signal. The whole app has one version. The `version` field in the root `package.json` is the only source of truth, written without the `v`. The tag and the changelog marker add it. See [GLOSSARY.md](GLOSSARY.md) for the term.

Versions follow SemVer on 0.x. `1.0.0` is reserved for the release that lifts invite only access.

The bump is suggested from the entries since the last release:

- MINOR when any entry starts with a verb other than `Fixed` or `Behind the scenes`
- PATCH when every entry starts with `Fixed` or `Behind the scenes`

There is no MAJOR bump before 1.0.0.

The script reads `client/public/changelog.md`. It has one `## YYYY-MM-DD` heading per day, newest on top, and new bullets go at the bottom of the newest section. A release is marked by a `- **Released vX.Y.Z**` bullet. Entries count as unreleased when they sit in newer sections above the newest marker, or below the marker in its own section. Bullets above the marker in its section were already released.

1. Release PRs are separate from feature PRs. Run them on demand, as a batch, from a fresh `main`:

   ```bash
   git switch main
   git pull
   git switch -c release/<name>
   ```

   The script refuses to run on `main`, on a detached HEAD, or with a dirty working tree.

2. Optional: preview the release. This writes nothing:

   ```bash
   pnpm release --dry-run
   pnpm release minor --dry-run
   ```

3. Run the release. `pnpm release` suggests a bump, and `minor` or `patch` forces one:

   ```bash
   pnpm release
   pnpm release minor
   pnpm release patch
   ```

   If no tag exists yet for the current version, the script releases that version without bumping. This is how `v0.5.0` is cut. Running it again before tagging refuses with "already prepared".

   The script edits the `version` value in `package.json`, and adds `- **Released vX.Y.Z**` as the last bullet of today's section in `client/public/changelog.md`. If the top section is not today's date, it adds a new section for today at the top.

4. The script never runs git. It prints the commands for you to run, `git add`, `git commit -m "Release vX.Y.Z"` and `git push -u origin <branch>`. The `git add` line lists only the changelog when the version did not change.

5. Open a PR titled `Release vX.Y.Z`, wait for CI, and merge it.

6. Once the deploy is healthy, run `pnpm release:tag` on `main`. It prints the tag commands: `git switch main`, `git pull`, `git log -1 --oneline`, `git tag -a vX.Y.Z -m "Release vX.Y.Z"` and `git push origin vX.Y.Z`. Check that the last commit is the release PR merge commit before tagging. Tags are annotated, and there are no GitHub Releases. You can edit the tag message by hand.

   Skipping the tag means the next `pnpm release` still sees no tag for the current version and refuses with "already prepared", unless you force `minor` or `patch`.

If you picked the wrong bump, fix it before `git add`. Restore the two files, then rerun with the bump you want:

```bash
git restore package.json client/public/changelog.md
pnpm release minor
```

`--dry-run` shows the bump before anything is written, so it avoids this problem.

Release script tests run with `pnpm test:scripts`. CI runs them too.
