# Contributing to nest-worker 🪺

First off, thank you for considering contributing to nest-worker! We appreciate your time and effort.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please:

1. Check the [issue tracker](https://github.com/varbyte-dev/nest-worker/issues) to see if the bug has already been reported
2. Try to reproduce the bug with the latest version
3. Gather the following information:
   - Node.js version (`node --version`)
   - Package version (`pnpm ls @varbyte/nest-worker` or `npm ls @varbyte/nest-worker`)
   - Wrangler version (`npx wrangler --version`)
   - Steps to reproduce
   - Expected behavior vs actual behavior
   - Minimal reproduction code (if possible)

Then [open a bug report](https://github.com/varbyte-dev/nest-worker/issues/new?labels=type%3Abug&template=bug_report.yml).

### 💡 Suggesting Features

Feature requests are welcome! Before submitting:

1. Check the [issue tracker](https://github.com/varbyte-dev/nest-worker/issues) and [roadmap](ROADMAP.md) to see if it's already planned
2. Consider the scope — small, focused features are more likely to be accepted

Then [open a feature request](https://github.com/varbyte-dev/nest-worker/issues/new?labels=type%3Afeature&template=feature_request.yml).

### 📝 Improving Documentation

Documentation improvements are always appreciated. You can:

- Fix typos or clarify existing docs
- Add examples or use cases
- Improve the [README](README.md) or [EXAMPLES](EXAMPLES.md)
- Contribute to the [full documentation site](https://github.com/varbyte-dev/nest-worker-docs)

### 🛠️ Setting Up the Development Environment

```bash
# Clone the repo
git clone https://github.com/varbyte-dev/nest-worker.git
cd nest-worker

# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Start dev server (Wrangler)
pnpm dev
```

### 📐 Project Structure

```
nest-worker/
├── src/                       # Package source code
│   ├── index.ts               # Public API exports
│   ├── core/                  # Core framework (DI, modules, lifecycle)
│   │   ├── application.ts     # NestWorkerFactory, app creation
│   │   ├── container.ts       # Dependency injection container
│   │   ├── router.ts          # Request routing
│   │   ├── middlewares.ts     # Middleware pipeline
│   │   ├── exceptions.ts      # HTTP exceptions (NotFoundException, etc.)
│   │   ├── request-context.ts # Request-scoped context
│   │   └── types.ts           # Type definitions
│   ├── decorators/            # Decorators (@Controller, @Get, @Post, @Module, etc.)
│   │   └── index.ts
│   ├── database/              # D1 integration
│   │   ├── repository.ts      # D1Repository
│   │   └── query-builder.ts   # QueryBuilder
│   └── extras/                # Optional modules
│       ├── middlewares.ts      # Built-in middlewares (CORS, logger, rate-limit, auth)
│       ├── swagger.ts          # Swagger/OpenAPI auto-generation
│       └── validation.ts       # Request validation
├── cli/                       # CLI package (@varbyte/nest-worker-cli)
│   ├── src/
│   │   ├── index.ts            # CLI entry point
│   │   ├── commands/           # CLI commands (generate, new, etc.)
│   │   ├── templates/          # Scaffolding templates
│   │   └── utils/              # Shared utilities
│   └── package.json
├── test/                       # Test files
├── example/                    # Example project
├── docs/                       # Documentation assets
├── migrations/                 # D1 database migrations
└── .github/                    # GitHub CI, PR/issue templates
```

### 🧪 Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run type checking
pnpm typecheck
```

### 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

types: feat | fix | docs | refactor | test | chore | style
scopes: core | cli | swagger | d1 | middlewares | docs

Examples:
  feat(core): add @Scheduled decorator for cron triggers
  fix(cli): handle edge case in project scaffolding
  docs: fix typo in README
```

### 📦 Pull Request Process

1. Link an existing issue — all PRs must be linked to an approved issue
2. Follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
3. Update tests and documentation as needed
4. Ensure all CI checks pass (`pnpm typecheck && pnpm test && pnpm build`)
5. Add exactly one `type:*` label

### 🚀 Release Process

Releases are handled by maintainers via GitHub Actions. The version is determined
by conventional commits since the last release.

## Questions?

If you have questions, feel free to open a [discussion](https://github.com/varbyte-dev/nest-worker/discussions) or ask in the issue tracker.

Thank you for contributing! ❤️
