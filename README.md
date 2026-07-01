# nest-worker 🪺

> NestJS-inspired mini framework for **Cloudflare Workers** with native **D1** support.
> 📖 [Full documentation](https://varbyte-dev.github.io/nest-worker-docs/)

[![npm version](https://img.shields.io/npm/v/@varbyte/nest-worker)](https://www.npmjs.com/package/@varbyte/nest-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-site-blue)](https://varbyte-dev.github.io/nest-worker-docs/)

---

## Features

- **Decorators** — `@Controller`, `@Get`, `@Post`, `@Body`, `@Param`, `@D1`, etc.
- **Modules** — organize your app with `@Module`
- **Dependency Injection** — `@Injectable` + constructor injection
- **D1 Integration** — `@D1()` injects the binding, `D1Repository` and `QueryBuilder` ready to use
- **Middlewares** — CORS, logger, rate limiting, bearer auth included
- **WebSocket / Durable Objects** — `@WebSocket()`, `@DurableObject()`, `@OnOpen()`, `@OnMessage()`, `@OnClose()` decorators for real-time bi-directional communication at the edge
- **HTTP Exceptions** — `NotFoundException`, `BadRequestException`, etc.
- **Swagger / OpenAPI** — auto-generated API documentation with `@ApiModel()` and `@Prop()` decorators, served via Swagger UI with optional Basic Auth
- **Zero runtime dependencies** — only `reflect-metadata`
- **SQL Injection Protection** — all identifiers are sanitized automatically

---

## Maintainer Policy

Public API and release decisions follow
[docs/API_RELEASE_POLICY.md](docs/API_RELEASE_POLICY.md). Review this policy
before changing exports, decorators, generated code, CLI commands, documented
behavior, or release notes.

---

## CLI — `@varbyte/nest-worker-cli`

Accelerate your development with the official CLI:

```bash
npm install -g @varbyte/nest-worker-cli
# or run directly
npx @varbyte/nest-worker-cli
```

### Commands

| Command | Description |
|---------|-------------|
| `nest-worker new <name>` | Scaffold a new project |
| `nest-worker generate module <name>` | Generate a module |
| `nest-worker generate controller <name>` | Generate a controller with CRUD routes |
| `nest-worker generate service <name>` | Generate an injectable service |
| `nest-worker generate resource <name>` | Generate a complete CRUD resource (module + controller + service + repository + model + DTOs + migration) |
| `nest-worker generate guard <name>` | Generate an auth guard middleware |
| `nest-worker generate middleware <name>` | Generate a custom middleware |
| `nest-worker generate exception <name>` | Generate a custom HTTP exception (`--status` flag) |
| `nest-worker generate filter <name>` | Generate an error-handling filter |
| `nest-worker generate repository <name>` | Generate a D1 repository |
| `nest-worker generate model <name>` | Generate a model interface |
| `nest-worker generate dto <name>` | Generate create & update DTOs with `@ApiModel()` decorators |
| `nest-worker generate provider <name>` | Generate a custom provider |
| `nest-worker generate migration <desc>` | Generate a SQL migration |
| `nest-worker generate seed <name>` | Generate a SQL seed |
| `nest-worker generate env <var>` | Add environment variable to `wrangler.toml` |
| `nest-worker generate swagger` | Generate Swagger/OpenAPI config with auto-detection |
| `nest-worker info` | Display project & framework info |
| `nest-worker list` | List generated resources |
| `nest-worker doctor` | Diagnose configuration issues |

### Swagger / OpenAPI Auto-Detection

The CLI can scan your existing controllers and DTOs to auto-generate Swagger documentation:

```bash
# Generate Swagger config and auto-detect decorators
nest-worker generate swagger --detect --update-worker

# Start your dev server
npm run dev

# Open http://localhost:8787/docs in your browser
```

The `--detect` flag:
1. Scans all controllers in `src/modules/`
2. Adds `@ApiTags()` to controllers (if missing)
3. Adds `@ApiOperation()` with auto-generated summaries for each route
4. Scans DTO files and adds `@ApiModel()` and `@Prop()` decorators
5. Infers property types from TypeScript type annotations

The `--update-worker` flag automatically updates `src/worker.ts` to enable Swagger.

### Quick Example

```bash
# Create a new project
nest-worker new my-api
cd my-api
npm install

# Generate a complete CRUD resource
nest-worker generate resource users

# Enable Swagger documentation
nest-worker generate swagger --detect --update-worker

# Start development
npm run dev
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install @varbyte/nest-worker reflect-metadata
npm install -D typescript wrangler @cloudflare/workers-types
```

### 2. Configure `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": ["@cloudflare/workers-types"]
  }
}
```

### 3. Create your Worker

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, cors } from '@varbyte/nest-worker';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
class AppModule {}

const app = createApplication(AppModule);
app.use(cors());

export default app.handler;
```

### 4. Configure `wrangler.toml`

```toml
name = "my-nest-worker"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "my-app-db"
database_id = "YOUR_D1_DATABASE_ID"
```

---

## Decorators

### Modules

```ts
@Module({
  imports: [OtherModule],      // import other modules
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],     // optional
})
class AppModule {}
```

### Controllers & Routes

```ts
@Controller('users')           // path prefix → /users
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()                       // GET /users
  getAll() { ... }

  @Get(':id')                  // GET /users/:id
  getOne(@Param('id') id: string) { ... }

  @Post()                      // POST /users
  @HttpCode(201)               // custom success status
  create(@Body() body: CreateUserDto) { ... }

  @Put(':id')                  // PUT /users/:id
  update(@Param('id') id: string, @Body() body: UpdateUserDto) { ... }

  @Delete(':id')               // DELETE /users/:id
  remove(@Param('id') id: string) { ... }
}
```

### Handler Parameters

| Decorator | Description |
|-----------|-------------|
| `@Body()` | Full request body (JSON) |
| `@Body('field')` | A specific body field |
| `@Param('id')` | Path parameter |
| `@Query('page')` | Query string parameter |
| `@Headers('authorization')` | Specific header |
| `@Req()` | Full Request object |
| `@D1()` | D1 binding (defaults to env.DB) |
| `@D1('MY_DB')` | D1 binding with custom key |
| `@Env()` | Complete env object |
| `@Env('MY_SECRET')` | Specific environment variable |

### Response Status Codes

Use `@HttpCode()` when a handler should return a specific success status while
still letting the framework serialize the handler result.

```ts
@Post()
@HttpCode(201)
create(@Body() body: CreateUserDto) {
  return this.users.create(body);
}
```

### Services

```ts
@Injectable()
export class UsersService {
  async findAll(db: D1Database) {
    const repo = new D1Repository<User>(db, 'users');
    return repo.findAll();
  }
}
```

---

## D1 — Database

### D1Repository

Base class with ready-to-use CRUD operations:

```ts
const repo = new D1Repository<User>(db, 'users');

// Basic CRUD
await repo.findAll();
await repo.findById(1);
await repo.findWhere({ role: 'admin' });
await repo.findOneWhere({ email: 'alice@example.com' });
await repo.create({ name: 'Alice', email: 'alice@example.com', role: 'user' });
await repo.update(1, { name: 'Alice Updated' });
await repo.delete(1);
await repo.count({ role: 'admin' });

// Custom queries
await repo.raw('SELECT * FROM users WHERE created_at > ?', '2024-01-01');
await repo.rawFirst('SELECT * FROM users WHERE email = ?', 'alice@example.com');
```

> **Security:** All column and table names are automatically sanitized against SQL injection. The `raw()` and `rawFirst()` methods rely on parameterized bindings for values.

### QueryBuilder

For complex queries with a fluent interface:

```ts
import { QueryBuilder } from '@varbyte/nest-worker';

const users = await new QueryBuilder<User>(db, 'users')
  .select('id', 'name', 'email')
  .where('role', 'admin')
  .where('name', 'A%', 'LIKE')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .offset(20)
  .all();

const count = await new QueryBuilder(db, 'users')
  .where('role', 'admin')
  .count();

const activeAdmins = await new QueryBuilder<User>(db, 'users')
  .whereIn('role', ['admin', 'owner'])
  .whereNull('deleted_at')
  .whereBetween('created_at', '2026-01-01', '2026-12-31')
  .all();
```

### Inject D1 in Controllers

```ts
@Get()
async getAll(@D1() db: D1Database) {
  // db = env.DB automatically
  const repo = new D1Repository(db, 'users');
  return repo.findAll();
}

// With custom binding
@Get()
async getData(@D1('ANALYTICS_DB') db: D1Database) {
  // db = env.ANALYTICS_DB
}
```

---

## Middlewares

### Global (app-level)

```ts
app
  .use(requestLogger())
  .use(cors({ origin: 'https://my-domain.com' }))
  .use(devRateLimit({ windowMs: 60_000, max: 100 }));
```

### Per controller or route

```ts
@Controller('admin')
@UseMiddleware(bearerAuth({ tokenEnvKey: 'ADMIN_TOKEN' }))  // applies to all routes
export class AdminController {

  @Delete(':id')
  @UseMiddleware(bearerAuth({ staticToken: 'super-secret' }))  // this route only
  remove(@Param('id') id: string) { ... }
}
```

### Available middlewares

```ts
// CORS
cors({ origin: '*', methods: ['GET', 'POST'], credentials: false })
cors({ origin: ['https://app.example', 'https://admin.example'] })
cors({ origin: (origin) => origin.endsWith('.trusted.example') })

// Credentials require an explicit origin, never '*'
cors({ origin: 'https://app.example', credentials: true })

// Logger (console)
logger()

// Request/response logger with request ids
requestLogger()
requestLogger({
  json: true,
  requestIdHeader: 'X-Request-Id',
  formatError: (error) => ({ name: 'DomainError', message: 'redacted' }),
  sink: (entry) => console.log(entry),
})

// Rate limiting by IP
devRateLimit({ windowMs: 60_000, max: 60 })

// Bearer Token auth
bearerAuth({ tokenEnvKey: 'API_SECRET' })   // reads env.API_SECRET
bearerAuth({ staticToken: 'my-token' })     // static token (dev only)
```

> **Rate limiting:** `devRateLimit()` uses in-memory state. It is useful for
> local development and tests, but it is not a durable or globally consistent
> production rate limiter on Cloudflare Workers. For production, use Durable
> Objects, KV with its consistency tradeoffs, or Cloudflare platform controls.
> The older `rateLimit()` export remains as a deprecated compatibility alias.

> **Logging:** `logger()` preserves the original request-start console log.
> Use `requestLogger()` when you need production-friendly request ids, final
> response status, request duration, and handled error summaries in your logs.

### Custom Middleware

```ts
import { MiddlewareFn } from '@varbyte/nest-worker';

const myMiddleware: MiddlewareFn = async (req, env, ctx) => {
  const token = req.headers.get('X-Api-Key');
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  // If no Response is returned, execution continues to the next middleware/handler
};
```

### Validation Pipes

Pipes run after handler parameters are resolved and before the controller
method is called. Use them to validate or transform handler arguments without
adding a validation library to the framework core.

```ts
import { BadRequestException, PipeFn, UsePipe, validateBody } from '@varbyte/nest-worker';

const requireName: PipeFn = (args) => {
  const body = args[0] as { name?: unknown };
  if (typeof body.name !== 'string') {
    throw new BadRequestException('name is required', { field: 'name' });
  }
};

@Post()
@UsePipe(requireName)
create(@Body() body: { name: string }) {
  return this.users.create(body);
}
```

For common body validation, use `validateBody()` to keep the pipe small and
dependency-free:

```ts
@Post()
@UsePipe(validateBody<{ name?: unknown }>((body) => {
  if (typeof body.name !== 'string') return 'name is required';
}))
create(@Body() body: { name: string }) {
  return this.users.create(body);
}
```

`createValidationPipe()` can wrap any validator function, including adapters to
schema libraries you choose to install in your app. The framework does not add a
validation library dependency.

---

## HTTP Exceptions

```ts
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
} from '@varbyte/nest-worker';

// In any handler or service
throw new NotFoundException('User not found');
throw new BadRequestException('Invalid email', { field: 'email' });
throw new HttpException('Custom error', 422);

// The framework catches them and responds with the correct status automatically
```

HTTP exceptions use a stable JSON envelope:

```json
{
  "error": "User not found",
  "statusCode": 404
}
```

Register global error filters when an application needs custom error-to-response
mapping. Filters can return a `Response`; returning nothing keeps the framework's
stable fallback behavior.

```ts
app.useErrorFilter((error, { request }) => {
  if (error instanceof DomainError) {
    return Response.json({
      error: error.message,
      path: new URL(request.url).pathname,
    }, { status: 422 });
  }
});
```

> **Production safety:** When `APP_ENV` is set to `"production"`, unexpected internal errors return a generic message instead of leaking error details.

---

## Handler Responses

The framework automatically converts what you return:

| Return Value | Response |
|-------------|----------|
| `object` / `array` | `200 JSON` |
| `string` | `200 text/plain` |
| `undefined` / `null` | `204 No Content` |
| `Response` | Used as-is |
| `throw HttpException` | Corresponding status in JSON |
| `@HttpCode(n)` | Uses `n` for serialized success responses |

---

## Dependency Injection

### Provider Types

| Type | Example | Description |
|------|---------|-------------|
| Class | `MyService` | Auto-instantiated with `new` |
| `useClass` | `{ provide: TOKEN, useClass: MyService }` | Alias to another class |
| `useValue` | `{ provide: 'CONFIG', useValue: { key: 'val' } }` | Static value |
| `useFactory` | `{ provide: TOKEN, useFactory: (dep) => dep.init(), inject: [Dep] }` | Factory function |

```ts
@Module({
  providers: [
    UsersService,
    { provide: 'CONFIG', useValue: { apiKey: 'sk-123' } },
    { provide: 'LOGGER', useFactory: (config) => new Logger(config), inject: ['CONFIG'] },
  ],
})
class AppModule {}
```

---

## Recommended Project Structure

```
my-worker/
├── migrations/
│   ├── 001_init.sql
│   └── 002_seed.sql
├── modules/
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   └── auth/
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       └── auth.module.ts
├── worker.ts               # Main entrypoint
├── wrangler.toml
├── tsconfig.json
└── package.json
```

### Multi-module example

```ts
// modules/users/users.module.ts
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

// worker.ts
@Module({
  imports: [UsersModule, AuthModule],
})
class AppModule {}
```

---

## D1 Commands

```bash
# Create database
wrangler d1 create my-app-db

# Run migration
wrangler d1 execute my-app-db --file=./migrations/001_init.sql

# Seed data
wrangler d1 execute my-app-db --file=./migrations/002_seed.sql

# Direct query
wrangler d1 execute my-app-db --command="SELECT * FROM users"

# Local dev (D1 included)
wrangler dev

# Deploy
wrangler deploy

# Secrets
wrangler secret put API_SECRET
```

---

## License

MIT © [Daniel Vargas](https://github.com/varbyte-dev)
