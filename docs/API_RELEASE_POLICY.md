# API and Release Policy

This project treats public API changes as product changes. A change is not
ready for review until its API impact, version impact, and changelog impact are
clear.

## Quick Path

1. Decide whether the change touches public API.
2. Choose the required semantic version impact.
3. Update tests and docs with the behavior change.
4. Make the PR description explain API impact and release notes.

## Public API Surface

The public API is everything a consumer can rely on after installing
`@varbyte/nest-worker` or `@varbyte/nest-worker-cli`.

| Area | Public when |
|------|-------------|
| Package entrypoint | Exported from `src/index.ts` and emitted in `dist/index.d.ts` |
| Runtime decorators | Imported by application code, such as `@Controller`, `@Get`, `@Body`, `@Inject`, or `@UsePipe` |
| Runtime classes/functions | Imported by application code, such as `createApplication`, exceptions, middlewares, repositories, and query helpers |
| Public types | Exported types used by applications, generated projects, or examples |
| CLI commands | Exposed through `@varbyte/nest-worker-cli` |
| Generated code | Files created by CLI commands that users are expected to edit or run |
| Documented behavior | Behavior described in `README.md`, `README.es.md`, `EXAMPLES.md`, or `EXAMPLES.es.md` |

Internal files can still become public by accident when docs, examples, CLI
templates, or generated projects depend on them. The public API contract test is
the guardrail; the policy is the judgment layer.

## Semver Rules

| Change | Version impact | Examples |
|--------|----------------|----------|
| Breaking change | Major | Removing or renaming exports, changing decorator semantics, changing error envelopes, tightening CORS defaults, changing generated code contracts |
| New capability | Minor | Adding a decorator, middleware, public type, CLI command, query helper, or optional behavior |
| Bug fix | Patch | Correcting incorrect behavior without requiring user code changes |
| Docs only | Patch or no release | README, examples, policy, or guide updates that do not change package output |
| Tests or CI only | No release | Coverage, workflow, or tooling changes that do not affect published packages |

For pre-1.0 releases, consumers still need upgrade signals. Use the same rules
even when the package version is `0.x`: breaking changes must be called out
explicitly and should use `!` in the conventional commit.

## Changelog Rules

This repository uses `commit-and-tag-version`.

| Commit type | Changelog section | Required when |
|-------------|-------------------|---------------|
| `feat` | Features | New public capability or generated behavior |
| `fix` | Bug Fixes | User-visible runtime, CLI, or generated-code fix |
| `perf` | Performance | User-visible performance improvement |
| `refactor` | Refactors | Internal change worth explaining to maintainers |
| `docs`, `test`, `ci`, `chore`, `style` | Hidden by `.versionrc.json` | No user-visible package behavior change |

Breaking changes must include a clear migration note in the PR body. If a
breaking change also needs release notes, prefer a `!` conventional commit and
make the PR title match.

## Release Commands

| Package | Command | Tag shape |
|---------|---------|-----------|
| Core package | `pnpm release` | `vX.Y.Z` |
| Core minor | `pnpm release:minor` | `vX.Y.Z` |
| Core major | `pnpm release:major` | `vX.Y.Z` |
| CLI package | Manual release flow until CLI release scripts are added | `cli-vX.Y.Z` |

Before publishing, run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @varbyte/nest-worker-cli typecheck
pnpm --filter @varbyte/nest-worker-cli build
```

## PR Checklist

Every PR should answer these review questions:

- Does this change touch public API?
- If yes, is the semver impact correct?
- If yes, are public API tests or generated-project tests updated?
- If behavior changed, are README or examples updated?
- If breaking, is there a migration note?
- If release-worthy, will `commit-and-tag-version` place it in the right changelog section?

## Current Remaining Policy Gaps

These are intentionally left out until the project needs them:

- automated release PRs
- generated changelog validation in CI
- separate CLI release command wrappers
- API extractor or declaration snapshot tooling

Do not add those tools before the manual policy starts hurting. Good process is
scaffolding; too much process is concrete poured before the building shape is
known.
