# 🪺 nest-worker Roadmap

## Vision

**nest-worker** aims to be the most productive framework for building Cloudflare Workers, bringing the familiar NestJS developer experience to the edge while embracing Worker-native patterns and minimal overhead.

---

## 🎯 Strategic Goals

### 1. Production-Ready Core (Current)
- [x] CRUD resource generation
- [x] OpenAPI / Swagger auto-documentation
- [ ] Request validation pipelines (#36)
- [ ] Enhanced error handling & logging (#32, #34)

### 2. Database & Storage Layer
- [ ] Query builder with pagination, sorting, filtering (#11)
- [ ] Multi-binding support (D1 + KV + R2 + Queues)
- [ ] Migration workflow improvements
- [ ] Seed data management

### 3. Developer Experience
- [ ] Hot-reload dev server
- [ ] VSCode extension with snippets
- [ ] Interactive CLI wizard
- [ ] Built-in testing utilities

### 4. Edge-Native Features
- [ ] WebSocket / Durable Objects support
- [ ] Cron triggers (Scheduled Events)
- [ ] Queue consumer/producer patterns
- [ ] Asset serving for Workers Sites

### 5. Ecosystem & Community
- [ ] Plugin system for custom providers
- [ ] Official middleware packages
- [ ] Integration templates
- [ ] Performance benchmarks

---

## 🏷️ Field Guide

| Field | Values | Purpose |
|-------|--------|---------|
| **Status** | Backlog · Todo · In Progress · Done | Workflow stage |
| **Priority** | P0 · P1 · P2 · P3 | Importance level |
| **Area** | Core · CLI · Docs · Infra · Example | Project area |

## 📦 Release Cadence

- **Minor** versions: Feature releases
- **Patch** versions: Bug fixes (as needed)
- Follows SemVer per public API

---

> Built with ❤️ by the varbyte team
