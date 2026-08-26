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

pnpm --filter server build
pnpm --filter server test
```

See the "Scripts" table in the README for the full list.
