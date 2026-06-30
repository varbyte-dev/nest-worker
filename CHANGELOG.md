# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.3.0](https://github.com/varbyte-dev/nest-worker/compare/v0.1.3...v0.3.0) (2026-06-30)


### ⚠ BREAKING CHANGES

* **database:** add explicit query builder operators (#12)
* **core:** harden CORS origin policy (#8)
* **core:** harden router error contract (#6)
* **core:** isolate module provider contexts (#4)

### Features

* **cli:** add Swagger auto-detection and enhanced code generation ([#41](https://github.com/varbyte-dev/nest-worker/issues/41)) ([d6bc4bc](https://github.com/varbyte-dev/nest-worker/commit/d6bc4bc4d59b53043e87cda069819a4a103abc29))
* **cli:** align generators with runtime APIs ([#39](https://github.com/varbyte-dev/nest-worker/issues/39)) ([26d585a](https://github.com/varbyte-dev/nest-worker/commit/26d585ae33997afef95873d83dc4950b7f0c0ed5))
* **core:** add global error filters ([#29](https://github.com/varbyte-dev/nest-worker/issues/29)) ([389a673](https://github.com/varbyte-dev/nest-worker/commit/389a673193761527b994106b0cefc3c37cbb36b1))
* **core:** add lightweight validation pipe helpers ([#37](https://github.com/varbyte-dev/nest-worker/issues/37)) ([6df0831](https://github.com/varbyte-dev/nest-worker/commit/6df0831dff47dd9abace33998cad4fb85a422af7))
* **core:** add structured request logging ([#16](https://github.com/varbyte-dev/nest-worker/issues/16)) ([be28feb](https://github.com/varbyte-dev/nest-worker/commit/be28feb403808e5f1c1c17330043420816ac1c4f))
* **core:** add validation pipes ([#14](https://github.com/varbyte-dev/nest-worker/issues/14)) ([630d4ff](https://github.com/varbyte-dev/nest-worker/commit/630d4ffe98a4593da50e5dc7a3bc6903604af299))
* **core:** clarify in-memory rate limiting ([#10](https://github.com/varbyte-dev/nest-worker/issues/10)) ([3d5f83b](https://github.com/varbyte-dev/nest-worker/commit/3d5f83b6613d9cb46ae8877f75058c235363374c))
* **core:** harden CORS origin policy ([#8](https://github.com/varbyte-dev/nest-worker/issues/8)) ([0a98a19](https://github.com/varbyte-dev/nest-worker/commit/0a98a19333c7e91891b90ab1ec62a52080108a22))
* **core:** harden router error contract ([#6](https://github.com/varbyte-dev/nest-worker/issues/6)) ([8a908ad](https://github.com/varbyte-dev/nest-worker/commit/8a908adbda2d2025b438a4be40c23c583b5a87f4))
* **core:** include error cause in request logs ([#33](https://github.com/varbyte-dev/nest-worker/issues/33)) ([dfad69d](https://github.com/varbyte-dev/nest-worker/commit/dfad69d6fc9dca02c179ac835c08b1c7da870926))
* **database:** add explicit query builder operators ([#12](https://github.com/varbyte-dev/nest-worker/issues/12)) ([ab7fc13](https://github.com/varbyte-dev/nest-worker/commit/ab7fc134526a410a50021320e4e9a8f8efd90c74))


### Bug Fixes

* **ci:** create CLI package in registry before publish ([cf407b8](https://github.com/varbyte-dev/nest-worker/commit/cf407b8849706ec856cf7248b96fdccbadd58cb9))
* **cli:** add publishConfig, remove provenance for first publish ([655f5a2](https://github.com/varbyte-dev/nest-worker/commit/655f5a231a60fb3d04e493c58f147b78c47e3606))
* **cli:** pass explicit deps to @Controller() for esbuild compat ([04f63e8](https://github.com/varbyte-dev/nest-worker/commit/04f63e836ed163470258d5402eb76ba6533a2603))


### Refactors

* **core:** isolate module provider contexts ([#4](https://github.com/varbyte-dev/nest-worker/issues/4)) ([52bb2b1](https://github.com/varbyte-dev/nest-worker/commit/52bb2b1682abfc0964c0d8a28a707449f9a6022a))
* **core:** separate runtime request context from extras ([#35](https://github.com/varbyte-dev/nest-worker/issues/35)) ([1f4a816](https://github.com/varbyte-dev/nest-worker/commit/1f4a816976a0e412f5a6e8dd9d0265daa47c4037))

## [0.1.2](https://github.com/varbyte-dev/nest-worker/compare/v0.1.1...v0.1.2) (2026-06-17)


### Bug Fixes

* move pnpm config to package.json, remove workspace file ([c609973](https://github.com/varbyte-dev/nest-worker/commit/c609973068201f48d517433def126d1a98bf64cf))

## [0.1.1](https://github.com/varbyte-dev/nest-worker/compare/v0.1.0...v0.1.1) (2026-06-17)


### Features

* improvements across security, DI, architecture, and testing ([2917dfa](https://github.com/varbyte-dev/nest-worker/commit/2917dfa34575a09ecf54c8833ca45ef7af54bd34))


### Bug Fixes

* approve build scripts in pnpm-workspace.yaml ([3246a64](https://github.com/varbyte-dev/nest-worker/commit/3246a645741798a50c096cd216727b56bb287697))
