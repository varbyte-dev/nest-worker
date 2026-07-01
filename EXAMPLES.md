# nest-worker Examples 🪺

> 📖 [Full documentation](https://varbyte-dev.github.io/nest-worker-docs/)


## CLI Usage

All the examples below can be generated automatically using `@varbyte/nest-worker-cli`:

### Quick Start

```bash
# Install the CLI
npm install -g @varbyte/nest-worker-cli

# Create a new project
nest-worker new my-api

# Generate a complete CRUD resource
nest-worker generate resource users
nest-worker generate resource posts
nest-worker generate resource comments

# Generate guards and middlewares
nest-worker generate guard admin
nest-worker generate middleware request-timer

# Generate WebSocket, Queue, Cron, and Static Assets
nest-worker generate websocket chat
nest-worker generate queue notifications
nest-worker generate scheduled daily-report
nest-worker generate static-assets

# See what was generated
nest-worker list
nest-worker doctor
```

This will scaffold the project structure, controllers, services, repositories, DTOs, and migrations automatically.

Full command reference:

| Command | What it generates |
|---------|-------------------|
| `nest-worker new <name>` | Full project scaffold with wrangler.toml, tsconfig, worker entry point, health check, middlewares, etc. |
| `nest-worker generate resource <name>` | Module + Controller + Service + Repository + Model + Create/Update DTOs + Migration |
| `nest-worker generate guard <name>` | Bearer token auth guard with `MiddlewareFn` |
| `nest-worker generate middleware <name>` | Custom middleware function |
| `nest-worker generate exception <name>` | Custom `HttpException` subclass |
| `nest-worker generate filter <name>` | Error-catching middleware filter |
| `nest-worker generate migration <desc>` | Timestamped SQL migration file |
| `nest-worker generate swagger` | Swagger/OpenAPI configuration file |
| `nest-worker generate websocket <name>` | WebSocket upgrade controller (echo handler) |
| `nest-worker generate queue <name>` | Queue producer + consumer pair |
| `nest-worker generate scheduled <name>` | Cron-triggered scheduled task controller |
| `nest-worker generate static-assets` | Static assets controller with SPA fallback |

---

> A comprehensive collection of examples for `@varbyte/nest-worker`.
> View this file in your preferred language: [English](EXAMPLES.md) · [Español](EXAMPLES.es.md)

---

## Table of Contents

1. [Basic Setup](#1-basic-setup)
2. [Controllers & Routing](#2-controllers--routing)
3. [Dependency Injection](#3-dependency-injection)
4. [Modules & Encapsulation](#4-modules--encapsulation)
5. [Database (D1)](#5-database-d1)
6. [Middlewares](#6-middlewares)
7. [HTTP Exceptions & Error Handling](#7-http-exceptions--error-handling)
8. [Provider Types (useClass / useValue / useFactory)](#8-provider-types)
9. [Swagger / OpenAPI Documentation](#9-swagger--openapi-documentation)
10. [Complete Application Example](#10-complete-application-example)
11. [WebSocket & Durable Objects](#11-websocket--durable-objects)
12. [Queue Producer & Consumer](#12-queue-producer--consumer)
13. [Cron Triggers (@Scheduled)](#13-cron-triggers-scheduled)
14. [Static Assets (@ServeStatic)](#14-static-assets-servestatic)

---

## 1. Basic Setup

### Installation

```bash
npm install @varbyte/nest-worker reflect-metadata
npm install -D typescript wrangler @cloudflare/workers-types
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "types": ["@cloudflare/workers-types"],
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

### Minimal Worker

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication } from '@varbyte/nest-worker';

@Module({})
class AppModule {}

export default createApplication(AppModule).handler;
```

This is the absolute minimum — it responds with `404 Not Found` to every request.

---

## 2. Controllers & Routing

### Basic Controller

```ts
// hello.controller.ts
import { Controller, Get } from '@varbyte/nest-worker';

@Controller('hello')
export class HelloController {
  @Get()
  hello() {
    return { message: 'Hello, World!' };
  }

  @Get(':name')
  greet(@Param('name') name: string) {
    return { message: `Hello, ${name}!` };
  }
}
```

### Full REST Controller

```ts
// items.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@varbyte/nest-worker';

interface Item {
  id: number;
  name: string;
  price: number;
}

@Controller('items')
export class ItemsController {
  private items: Item[] = [];
  private nextId = 1;

  @Get()
  list(@Query('category') category?: string): { data: Item[]; total: number } {
    const filtered = category
      ? this.items.filter((i) => i.name.includes(category))
      : this.items;
    return { data: filtered, total: filtered.length };
  }

  @Get(':id')
  getOne(@Param('id') id: string): Item | undefined {
    return this.items.find((i) => i.id === Number(id));
  }

  @Post()
  create(@Body() body: { name: string; price: number }): Item {
    const item: Item = { id: this.nextId++, ...body };
    this.items.push(item);
    return item;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Item>): Item | undefined {
    const item = this.items.find((i) => i.id === Number(id));
    if (item) Object.assign(item, body);
    return item;
  }

  @Delete(':id')
  remove(@Param('id') id: string): { success: boolean } {
    const idx = this.items.findIndex((i) => i.id === Number(id));
    if (idx !== -1) this.items.splice(idx, 1);
    return { success: idx !== -1 };
  }
}
```

### Using Request and Headers

```ts
// debug.controller.ts
import { Controller, Get, Req, Headers } from '@varbyte/nest-worker';

@Controller('debug')
export class DebugController {
  @Get('headers')
  showHeaders(@Headers() allHeaders: Record<string, string>) {
    return { headers: allHeaders };
  }

  @Get('ua')
  userAgent(@Headers('user-agent') ua: string) {
    return { userAgent: ua };
  }

  @Get('echo')
  echoRequest(@Req() req: Request) {
    return {
      url: req.url,
      method: req.method,
      cf: (req as any).cf,
    };
  }
}
```

---

## 3. Dependency Injection

### Basic Service Injection

```ts
// greeting.service.ts
import { Injectable } from '@varbyte/nest-worker';

@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }

  farewell(name: string): string {
    return `Goodbye, ${name}!`;
  }
}
```

```ts
// greeting.controller.ts
import { Controller, Get, Param } from '@varbyte/nest-worker';
import { GreetingService } from './greeting.service';

@Controller('greet')
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get(':name')
  greet(@Param('name') name: string) {
    return { message: this.greetingService.greet(name) };
  }
}
```

### Service with Multiple Dependencies

```ts
// user.service.ts
import { Injectable } from '@varbyte/nest-worker';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';

@Injectable()
export class UserService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
  ) {}

  findAll() {
    this.logger.log('Finding all users');
    const maxResults = this.config.get('MAX_USERS', 100);
    return { users: [], maxResults };
  }
}
```

### Circular Dependency (Not Recommended but Supported)

```ts
// a.service.ts
import { Injectable, Inject } from '@varbyte/nest-worker';

@Injectable()
export class AService {
  constructor(@Inject('BService') private b: any) {}

  ping() {
    return 'A -> B: ' + this.b.pong();
  }

  pong() {
    return 'A pong';
  }
}
```

> **Note:** Circular dependencies require using `@Inject()` with a string token to break the cycle.

---

## 4. Modules & Encapsulation

### Feature Module

```ts
// users/users.module.ts
import { Module } from '@varbyte/nest-worker';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // make it available to other modules
})
export class UsersModule {}
```

### Feature Module with Internal Helpers

```ts
// auth/auth.module.ts
import { Module } from '@varbyte/nest-worker';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenHelper } from './token.helper';     // internal, not exported
import { PasswordHasher } from './password.hasher'; // internal, not exported

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenHelper, PasswordHasher],
  exports: [AuthService], // only AuthService is visible to other modules
})
export class AuthModule {}
```

### Root Module with Imports

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication } from '@varbyte/nest-worker';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [HealthController],
})
class AppModule {}

export default createApplication(AppModule).handler;
```

---

## 5. Database (D1)

### D1Repository - Complete CRUD

```ts
// user.entity.ts
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'manager';
  created_at: string;
}
```

```ts
// user.service.ts
import { Injectable, NotFoundException, D1Repository, D1Database } from '@varbyte/nest-worker';
import { User } from './user.entity';

@Injectable()
export class UserService {
  private getRepo(db: D1Database): D1Repository<User> {
    return new D1Repository<User>(db, 'users');
  }

  async findAll(db: D1Database) {
    return this.getRepo(db).findAll();
  }

  async findById(db: D1Database, id: number) {
    const user = await this.getRepo(db).findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async findByRole(db: D1Database, role: string) {
    return this.getRepo(db).findWhere({ role } as Partial<User>);
  }

  async findByEmail(db: D1Database, email: string) {
    return this.getRepo(db).findOneWhere({ email } as Partial<User>);
  }

  async create(db: D1Database, data: { name: string; email: string; role?: string }) {
    const result = await this.getRepo(db).create(data as any);
    return { id: result.meta.last_row_id!, ...data };
  }

  async update(db: D1Database, id: number, data: Partial<User>) {
    await this.findById(db, id); // throws if not found
    await this.getRepo(db).update(id, data);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number) {
    await this.findById(db, id);
    await this.getRepo(db).delete(id);
    return { message: `User #${id} deleted` };
  }

  async countAdmins(db: D1Database) {
    return this.getRepo(db).count({ role: 'admin' } as Partial<User>);
  }

  async customQuery(db: D1Database, sinceDate: string) {
    return this.getRepo(db).raw<User>(
      'SELECT * FROM users WHERE created_at > ? ORDER BY created_at DESC',
      sinceDate,
    );
  }
}
```

### QueryBuilder - Advanced Queries

```ts
import { QueryBuilder, D1Database } from '@varbyte/nest-worker';

// Basic fluent query
const users = await new QueryBuilder<User>(db, 'users')
  .select('id', 'name', 'email')
  .where('role', 'admin')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .all();

// With LIKE operator
const search = await new QueryBuilder(db, 'users')
  .where('name', '%john%', 'LIKE')
  .all();

// Count with conditions
const count = await new QueryBuilder(db, 'users')
  .where('role', 'admin')
  .where('active', 1)
  .count();

// Explicit multi-value and null operators
const activeAdmins = await new QueryBuilder<User>(db, 'users')
  .whereIn('role', ['admin', 'owner'])
  .whereNotIn('status', ['blocked', 'pending'])
  .whereNull('deleted_at')
  .whereBetween('created_at', '2026-01-01', '2026-12-31')
  .all();

// Pagination
const page = await new QueryBuilder(db, 'users')
  .orderBy('created_at', 'DESC')
  .limit(20)
  .offset(40) // page 3 with 20 per page
  .all();

// First match
const admin = await new QueryBuilder<User>(db, 'users')
  .where('role', 'admin')
  .first();
```

### Inject D1 in Controllers

```ts
// blog.controller.ts
import { Controller, Get, Post, D1, Body } from '@varbyte/nest-worker';

@Controller('posts')
export class BlogController {
  @Get()
  async list(@D1() db: D1Database) {
    return new D1Repository(db, 'posts').findAll();
  }

  @Post()
  async create(@D1() db: D1Database, @Body() body: any) {
    return new D1Repository(db, 'posts').create(body);
  }
}

// With multiple D1 databases
@Get('analytics')
async getAnalytics(
  @D1('DB') db: D1Database,
  @D1('ANALYTICS_DB') analytics: D1Database,
) {
  const users = await new D1Repository(db, 'users').count();
  const events = await new D1Repository(analytics, 'events').count();
  return { users, events };
}
```

### Using @Env for Configuration

```ts
// config.controller.ts
import { Controller, Get, Env } from '@varbyte/nest-worker';

@Controller('config')
export class ConfigController {
  @Get()
  showConfig(@Env() env: Record<string, unknown>) {
    return {
      appEnv: env.APP_ENV,
      hasApiSecret: !!env.API_SECRET,
    };
  }

  @Get('secret')
  getSecret(@Env('API_SECRET') secret: string) {
    return { secret: secret ? '***configured***' : 'not set' };
  }
}
```

---

## 6. Middlewares

### Global Middlewares

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, cors, logger, devRateLimit } from '@varbyte/nest-worker';
import { AppController } from './app.controller';

@Module({ controllers: [AppController] })
class AppModule {}

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({
    origin: 'https://myapp.com',
    methods: ['GET', 'POST'],
    credentials: true,
  }))
  .use(devRateLimit({
    windowMs: 60_000,  // 1 minute
    max: 100,          // 100 requests per minute
  }));

export default app.handler;
```

> `devRateLimit()` is in-memory and intended for local development/tests. It is
> not production-safe on Cloudflare Workers; use Durable Objects, KV with
> consistency tradeoffs, or Cloudflare platform controls for production.

### Per-Route Auth with Bearer Token

```ts
// admin.controller.ts
import { Controller, Get, Delete, Param, UseMiddleware } from '@varbyte/nest-worker';
import { bearerAuth } from '@varbyte/nest-worker';

@Controller('admin')
@UseMiddleware(bearerAuth({ tokenEnvKey: 'ADMIN_TOKEN' }))
export class AdminController {
  @Get('stats')
  stats() {
    return { users: 150, revenue: 45000 };
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return { message: `User #${id} deleted` };
  }
}
```

### Mixed Middlewares

```ts
import { bearerAuth, cors, devRateLimit, UseMiddleware } from '@varbyte/nest-worker';

@Controller('api')
@UseMiddleware(cors({ origin: '*' }), devRateLimit({ max: 30 }))
export class ApiController {
  @Get('public')
  publicData() {
    return { data: 'public' };
  }

  @Get('protected')
  @UseMiddleware(bearerAuth({ staticToken: 'my-secret-token' }))
  protectedData() {
    return { data: 'super-secret' };
  }
}
```

### Custom Middleware

```ts
// middlewares/request-timer.ts
import { MiddlewareFn } from '@varbyte/nest-worker';

export const requestTimer: MiddlewareFn = async (req, env, ctx) => {
  const start = Date.now();
  const url = new URL(req.url);

  // Schedule cleanup after response
  ctx.waitUntil(
    new Promise((resolve) => {
      // Note: in a real scenario, you'd wrap the fetch handler
      // to measure full request/response lifecycle
      resolve(null);
    }),
  );

  console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);
};
```

```ts
// middlewares/api-key.ts
import { MiddlewareFn } from '@varbyte/nest-worker';

export const apiKeyAuth = (validKeys: string[]): MiddlewareFn => {
  return async (req, env, ctx) => {
    const key = req.headers.get('X-API-Key');
    if (!key) {
      return new Response(JSON.stringify({ error: 'API key required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!validKeys.includes(key)) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};
```

### Order of Middleware Execution

Middlewares run in the order they are registered:

```ts
// Execution order:
// 1. logger (global)
// 2. cors (global)
// 3. Controller-level middlewares (from @UseMiddleware on the class)
// 4. Route-level middlewares (from @UseMiddleware on the method)
// 5. Controller-level pipes (from @UsePipe on the class)
// 6. Route-level pipes (from @UsePipe on the method)
// 7. Route handler

app
  .use(logger())       // 1st
  .use(cors());        // 2nd

@Controller('items')
@UseMiddleware(mw1)    // 3rd — applies to all routes in this controller
export class ItemsController {
  @Get()
  @UseMiddleware(mw2)  // 4th — only for this route
  @UsePipe(pipe1)      // 6th — validates/transforms resolved args
  list() {
    // 7th
    return { items: [] };
  }
}
```

If any middleware returns a `Response`, the chain stops immediately.

### Validation Pipes

```ts
import { BadRequestException, Body, PipeFn, Post, UsePipe } from '@varbyte/nest-worker';

const requireEmail: PipeFn = (args) => {
  const body = args[0] as { email?: unknown };
  if (typeof body.email !== 'string') {
    throw new BadRequestException('email is required', { field: 'email' });
  }
};

@Post()
@UsePipe(requireEmail)
create(@Body() body: { email: string }) {
  return body;
}
```

---

## 7. HTTP Exceptions & Error Handling

### All Available Exceptions

```ts
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
} from '@varbyte/nest-worker';

// 400 Bad Request
throw new BadRequestException('Invalid input');
throw new BadRequestException('Email already exists', { field: 'email', value: 'test@test.com' });

// 401 Unauthorized
throw new UnauthorizedException('Invalid credentials');

// 403 Forbidden
throw new ForbiddenException('Insufficient permissions');

// 404 Not Found
throw new NotFoundException('User #42 not found');

// 409 Conflict
throw new ConflictException('Username already taken');

// 500 Internal Server Error
throw new InternalServerErrorException('Database connection failed');

// Custom status code
throw new HttpException('Service Unavailable', 503);
```

### Exception Handling in Services

```ts
@Injectable()
export class OrderService {
  async findById(db: D1Database, id: number) {
    const order = await new D1Repository(db, 'orders').findById(id);
    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }
    return order;
  }

  async placeOrder(db: D1Database, data: any) {
    if (!data.items?.length) {
      throw new BadRequestException('Order must have at least one item');
    }
    if (data.total < 0) {
      throw new BadRequestException('Invalid total amount', { total: data.total });
    }
    return new D1Repository(db, 'orders').create(data);
  }
}
```

### Catching Errors (Custom Error Response)

The framework catches all errors automatically. For custom error-to-response logic, wrap with a middleware:

```ts
const errorHandler: MiddlewareFn = async (req, env, ctx) => {
  try {
    // Don't return — let it pass through
  } catch (err) {
    if (err instanceof MyCustomError) {
      return new Response(JSON.stringify({ error: err.userMessage }), {
        status: err.statusCode,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err; // re-throw for framework to handle
  }
};
```

---

## 8. Provider Types

### useClass — Alias a Class

```ts
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
}

class FileLogger implements Logger {
  log(message: string) { /* write to file */ }
}

@Module({
  providers: [
    { provide: 'Logger', useClass: ConsoleLogger },
  ],
})
class AppModule {}

// Later, inject with @Inject('Logger')
```

### useValue — Static Values / Configuration

```ts
// config.ts
export const APP_CONFIG = {
  appName: 'MyWorker',
  version: '1.0.0',
  maxConnections: 10,
  features: {
    darkMode: true,
    beta: false,
  },
};

// module
@Module({
  providers: [
    { provide: 'APP_CONFIG', useValue: APP_CONFIG },
    { provide: 'API_BASE_URL', useValue: 'https://api.example.com/v2' },
    { provide: 'MAX_RETRIES', useValue: 3 },
  ],
})
class AppModule {}
```

```ts
// injected.service.ts
import { Injectable, Inject } from '@varbyte/nest-worker';

@Injectable()
export class InjectedService {
  constructor(
    @Inject('APP_CONFIG') private config: typeof APP_CONFIG,
    @Inject('API_BASE_URL') private baseUrl: string,
  ) {}

  getInfo() {
    return {
      app: this.config.appName,
      version: this.config.version,
      api: this.baseUrl,
    };
  }
}
```

### useFactory — Dynamic Providers

```ts
import { D1Database } from '@varbyte/nest-worker';

// Factory with dependencies
@Module({
  providers: [
    D1Repository,
    {
      provide: 'USER_REPO',
      useFactory: (db: D1Database) => new D1Repository<User>(db, 'users'),
      inject: [D1Repository], // dependencies resolved by the container
    },
    {
      provide: 'CONFIG',
      useFactory: () => {
        // Dynamic configuration based on environment
        const env = process.env.APP_ENV || 'development';
        return {
          environment: env,
          cacheTTL: env === 'production' ? 3600 : 0,
          debugMode: env !== 'production',
        };
      },
    },
  ],
})
class AppModule {}
```

### Mixed Providers in a Module

```ts
@Module({
  providers: [
    // Class provider (auto-DI)
    UsersService,
    AuthService,

    // Value provider
    { provide: 'APP_NAME', useValue: 'My API' },

    // Alias
    { provide: 'UserService', useClass: UsersService },

    // Factory
    {
      provide: 'DB_CONNECTION',
      useFactory: (config) => initializeDb(config),
      inject: ['APP_CONFIG'],
    },
  ],
})
class AppModule {}
```

---

## 9. Swagger / OpenAPI Documentation

Generate interactive API documentation automatically with Swagger UI.

### Setup

Use `app.useSwagger()` to enable documentation with optional Basic Auth protection:

```typescript
import { createApplication, Module, cors, logger } from '@varbyte/nest-worker';

@Module({ controllers: [UsersController], providers: [UsersService] })
class AppModule {}

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({ origin: "*" }))
  .useSwagger({
    title: 'My API',
    version: '1.0.0',
    description: 'API documentation',
    path: '/docs',                            // default: /docs
    auth: {                                   // optional Basic Auth
      username: 'admin',
      password: process.env.SWAGGER_PASSWORD || 'secret',
    },
    servers: [
      { url: 'https://api.example.com', description: 'Production' },
    ],
  });

export default app.handler;
```

Open `/docs` in your browser to see the Swagger UI. The OpenAPI JSON spec is available at `/docs/json`.

### Decorating DTOs with `@ApiModel()` and `@Prop()`

Document your data models with a single decorator per class and one per property:

```typescript
import { ApiModel, Prop } from '@varbyte/nest-worker';

@ApiModel({ description: 'User data model' })
class User {
  @Prop() id!: number;
  @Prop({ description: 'Full name' }) name!: string;
  @Prop({ description: 'Email address', example: 'user@example.com' }) email!: string;
  @Prop({ description: 'User role', example: 'user' }) role!: string;
  @Prop() created_at!: string;
}

@ApiModel({ description: 'Payload to create a user' })
class CreateUserDto {
  @Prop() name!: string;
  @Prop() email!: string;
  @Prop({ description: 'Defaults to "user"' }) role?: string;
}
```

### Describing Endpoints (Optional)

Use optional decorators to enrich the generated documentation:

```typescript
import {
  Controller, Get, Post, Body, Param,
  ApiTags, ApiOperation, ApiResponse,
} from '@varbyte/nest-worker';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID', description: 'Returns a single user' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getOne(@Param('id') id: string) {
    // ...
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  async create(@Body() body: CreateUserDto) {
    // ...
  }
}
```

The body schema and response models are automatically detected from `@Body()` and `design:returntype`. When you use `@ApiModel()` + `@Prop()` on your DTO classes, the full schema appears in Swagger UI with property types, descriptions, and examples.

### CLI Generator

```bash
# Generate a swagger configuration file
nest-worker generate swagger

# Auto-detect controllers and DTOs, add decorators
nest-worker generate swagger --detect

# One-shot: generate config + detect + enable in worker.ts
nest-worker generate swagger --detect --update-worker
```

#### Options

| Flag | Description |
|------|-------------|
| `--detect` | Scan all controllers and DTOs, auto-add `@ApiTags()`, `@ApiOperation()`, `@ApiModel()`, `@Prop()` where missing |
| `--update-worker` | Automatically enable swagger in `src/worker.ts` |
| `--title <name>` | API title (default: "My API") |
| `--version <ver>` | API version (default: "1.0.0") |
| `--path <path>` | Swagger UI path (default: "/docs") |
| `--no-auth` | Disable Basic Auth protection |
| `-f, --force` | Overwrite existing config file |

When you run `--detect`, the CLI:
1. Scans `src/modules/**/*.controller.ts` for all controllers
2. Adds `@ApiTags('ClassName')` if missing
3. Adds `@ApiOperation({ summary: '...' })` for each route
4. Scans `src/modules/**/*.dto.ts` for DTO files
5. Adds `@ApiModel()` and `@Prop()` decorators to DTOs
6. Infers property types from TypeScript type annotations

Newly generated resources (`nest-worker generate resource`) already include `@ApiTags()`, `@ApiOperation()`, `@ApiModel()`, and `@Prop()` decorators by default.

---

## 10. Complete Application Example

### User Management API

```sql
-- migrations/001_init.sql
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  role       TEXT    NOT NULL DEFAULT 'user',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

```ts
// user.entity.ts
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}
```

```ts
// user.service.ts
import { Injectable, NotFoundException, BadRequestException, D1Repository, D1Database } from '@varbyte/nest-worker';
import { User } from './user.entity';

@Injectable()
export class UserService {
  async findAll(db: D1Database) {
    return new D1Repository<User>(db, 'users').findAll();
  }

  async findById(db: D1Database, id: number) {
    const user = await new D1Repository<User>(db, 'users').findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async create(db: D1Database, data: { name: string; email: string; role?: string }) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    if (!data.email?.trim()) throw new BadRequestException('Email is required');

    const existing = await new D1Repository<User>(db, 'users')
      .findOneWhere({ email: data.email } as Partial<User>);
    if (existing) throw new BadRequestException('Email already in use');

    const result = await new D1Repository<User>(db, 'users').create(data as any);
    return { id: result.meta.last_row_id!, ...data };
  }

  async update(db: D1Database, id: number, data: Partial<User>) {
    await this.findById(db, id);
    await new D1Repository<User>(db, 'users').update(id, data);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number) {
    await this.findById(db, id);
    await new D1Repository<User>(db, 'users').delete(id);
    return { message: `User #${id} deleted` };
  }

  async search(db: D1Database, query: string) {
    return new D1Repository<User>(db, 'users')
      .raw<User>('SELECT * FROM users WHERE name LIKE ? OR email LIKE ?', `%${query}%`, `%${query}%`);
  }
}
```

```ts
// user.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, D1, UseMiddleware, bearerAuth } from '@varbyte/nest-worker';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async list(@D1() db: D1Database, @Query('q') q?: string) {
    if (q) return this.userService.search(db, q);
    return this.userService.findAll(db);
  }

  @Get(':id')
  async get(@D1() db: D1Database, @Param('id') id: string) {
    return this.userService.findById(db, parseInt(id));
  }

  @Post()
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async create(@D1() db: D1Database, @Body() body: { name: string; email: string; role?: string }) {
    return this.userService.create(db, body);
  }

  @Put(':id')
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async update(@D1() db: D1Database, @Param('id') id: string, @Body() body: any) {
    return this.userService.update(db, parseInt(id), body);
  }

  @Delete(':id')
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async remove(@D1() db: D1Database, @Param('id') id: string) {
    return this.userService.delete(db, parseInt(id));
  }
}
```

```ts
// health.controller.ts
import { Controller, Get, D1, Env } from '@varbyte/nest-worker';

@Controller('health')
export class HealthController {
  @Get()
  async check(@D1() db: D1Database, @Env() env: Record<string, unknown>) {
    try {
      await db.prepare('SELECT 1').first();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: env.APP_ENV || 'unknown',
      };
    } catch (err) {
      return {
        status: 'degraded',
        database: 'unreachable',
      };
    }
  }
}
```

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, cors, logger, devRateLimit } from '@varbyte/nest-worker';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [UserController, HealthController],
  providers: [UserService],
})
class AppModule {}

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({ origin: '*' }))
  .use(devRateLimit({ windowMs: 60_000, max: 60 }));

export default app.handler;
```

---

## 11. WebSocket & Durable Objects

Build real-time, bi-directional applications at the edge with WebSocket
upgrade handlers and stateful Durable Objects.

### WebSocket Upgrade Handler

Use `@WebSocket()` to mark a controller method as a WebSocket upgrade
endpoint. The method receives the upgrade `Request` and returns a `Response`
with `status: 101` and a `webSocket` property.

```ts
// ws.controller.ts
import { Controller, WebSocket, wsUpgradeResponse } from '@varbyte/nest-worker';

@Controller('ws')
export class WsController {
  @WebSocket('/echo')
  handleEcho() {
    const [client, server] = new WebSocketPair();
    server.accept();

    server.addEventListener('message', (event) => {
      // Echo the message back
      server.send(`Echo: ${event.data}`);
    });

    server.addEventListener('close', () => {
      console.log('Connection closed');
    });

    return wsUpgradeResponse(client);
  }
}
```

Register the controller in your module as usual:

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication } from '@varbyte/nest-worker';
import { WsController } from './ws.controller';

@Module({ controllers: [WsController] })
class AppModule {}

export default createApplication(AppModule).handler;
```

The WebSocket route uses `GET` by default and the router automatically
passes through `101` upgrade responses without wrapping them with CORS or
other response transforms.

### Durable Object with WebSocket Lifecycle

For stateful real-time applications (chat rooms, game sessions, live
collaboration), use `@DurableObject()` with the lifecycle decorators
`@OnOpen()`, `@OnMessage()`, and `@OnClose()`.

```ts
// chat-room.ts
import {
  DurableObject,
  OnOpen,
  OnMessage,
  OnClose,
  handleWebSocketLifecycle,
} from '@varbyte/nest-worker';

interface Env {
  CHAT_ROOM: DurableObjectNamespace;
}

@DurableObject()
export class ChatRoom {
  private sessions: WebSocket[] = [];
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  /** Required — Workers calls fetch() on the DO for each upgrade request */
  async fetch(request: Request): Promise<Response> {
    return handleWebSocketLifecycle(this, request);
  }

  @OnOpen()
  onOpen(connection: WebSocket) {
    this.sessions.push(connection);
    connection.send(JSON.stringify({
      type: 'system',
      message: `Welcome! ${this.sessions.length} user(s) connected.`,
    }));
  }

  @OnMessage()
  onMessage(connection: WebSocket, message: string | ArrayBuffer) {
    // Broadcast to all connected sessions
    for (const session of this.sessions) {
      if (session !== connection) {
        session.send(message);
      }
    }
  }

  @OnClose()
  onClose(connection: WebSocket) {
    this.sessions = this.sessions.filter((s) => s !== connection);
  }
}
```

Configure the Durable Object in `wrangler.toml`:

```toml
name = "my-realtime-app"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"

[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]
```

Register the DO class as a provider in your module and create the HTTP
endpoint that upgrades connections:

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, Get, Controller } from '@varbyte/nest-worker';
import { ChatRoom } from './chat-room';
import { wsUpgradeResponse } from '@varbyte/nest-worker';

@Controller('chat')
export class ChatController {
  @Get()
  async connect(req: Request, env: { CHAT_ROOM: DurableObjectNamespace }) {
    const url = new URL(req.url);
    const doId = env.CHAT_ROOM.idFromName('default-room');
    const stub = env.CHAT_ROOM.get(doId);
    return stub.fetch(req);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatRoom],  // Register the DO class
})
class AppModule {}

export default createApplication(AppModule).handler;
```

### Available Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@WebSocket(path?)` | Method | Marks a controller method as a WebSocket upgrade handler (`GET` route with `isWebSocket: true`) |
| `@DurableObject()` | Class | Marks a class as a Durable Object with state management |
| `@OnOpen()` | Method | Handles new WebSocket connections inside a `@DurableObject()` class |
| `@OnMessage()` | Method | Handles incoming messages inside a `@DurableObject()` class |
| `@OnClose()` | Method | Handles connection close inside a `@DurableObject()` class |

### Utility Functions

| Function | Description |
|----------|-------------|
| `wsUpgradeResponse(webSocket)` | Creates a `Response` with `status: 101` and the given `webSocket` |
| `handleWebSocketLifecycle(instance, request)` | Wires up `@OnOpen`/`@OnMessage`/`@OnClose` handlers inside a DO's `fetch()` |
| `isWebSocketRoute(route)` | Returns `true` if a `RouteDefinition` is a WebSocket handler |
| `isDurableObjectClass(target)` | Returns `true` if a class is decorated with `@DurableObject()` |
| `getWsEvents(target)` | Returns the registered WebSocket lifecycle events for a class |

---

## 12. Queue Producer & Consumer

Integrate Cloudflare Queues for reliable message production and consumption
at the edge.

### Producer (@QueueProducer)

Use `@QueueProducer()` on a property to send messages to a queue. The
property becomes a `QueueProducer` with `send()` and `sendBatch()` methods.

```ts
// notification.service.ts
import { Injectable, QueueProducer, QueueProducerType } from '@varbyte/nest-worker';

@Injectable()
export class NotificationService {
  @QueueProducer()
  declare queue: QueueProducerType;

  async sendWelcome(user: { id: number; email: string }) {
    await this.queue.send({
      type: 'welcome_email',
      userId: user.id,
      email: user.email,
    });
  }

  async sendBulk(users: Array<{ id: number }>) {
    await this.queue.sendBatch(
      users.map((u) => ({ type: 'bulk_notification', userId: u.id })),
    );
  }
}
```

> **Important:** Always use `declare` when declaring a `@QueueProducer()`
> property to prevent TypeScript's class field initialisation from shadowing
> the decorator's getter.

#### Custom Binding Name

By default, `@QueueProducer()` reads from `env.QUEUE`. Pass a different
binding name to use another queue binding:

```ts
class EmailProducer {
  @QueueProducer('EMAIL_QUEUE')
  declare emailQueue: QueueProducerType;

  async send(email: Email) {
    await this.emailQueue.send(email);
  }
}
```

### Consumer (@QueueConsumer)

Use `@QueueConsumer(queueName, options?)` on a controller method to consume
messages from a queue. The method receives the `MessageBatch` when messages
are delivered.

```ts
// notification.consumer.ts
import { Controller, QueueConsumer } from '@varbyte/nest-worker';

@Controller()
export class NotificationConsumer {
  @QueueConsumer('send-queue', { batchSize: 10, maxRetries: 3 })
  async handle(batch: MessageBatch) {
    for (const msg of batch.messages) {
      const { type, userId, email } = msg.body;

      switch (type) {
        case 'welcome_email':
          console.log(`Sending welcome to ${email} (user #${userId})`);
          break;
        case 'bulk_notification':
          console.log(`Notifying user #${userId}`);
          break;
        default:
          console.warn(`Unknown message type: ${type}`);
      }
    }
  }
}
```

### Wiring the Queue Handler

Export the queue handler from your worker entry-point alongside the
fetch handler:

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, createQueueHandler } from '@varbyte/nest-worker';
import { NotificationService } from './notification.service';
import { NotificationConsumer } from './notification.consumer';

@Module({
  controllers: [NotificationConsumer],
  providers: [NotificationService],
})
class AppModule {}

const app = createApplication(AppModule);

export default {
  fetch: app.handler.fetch,
  queue: createQueueHandler(
    (ctrlClass) => app.container.resolveController(ctrlClass),
    app.container.getControllers(),
  ),
};
```

> **Note:** The `app.container` property gives you access to the DI
> container so `createQueueHandler` can properly resolve controller
> instances with their dependencies.

### wrangler.toml Configuration

Add your queue bindings in `wrangler.toml`:

```toml
name = "my-queue-worker"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[queues.producers]]
binding = "QUEUE"
queue = "send-queue"

[[queues.consumers]]
queue = "send-queue"
max_batch_size = 10
max_retries = 3
```

### Available Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@QueueProducer(binding?)` | Property | Marks a property as a queue producer with `send()` / `sendBatch()` |
| `@QueueConsumer(queue, opts?)` | Method | Marks a method as a consumer handler for the named queue |

### Utility Functions

| Function | Description |
|----------|-------------|
| `createQueueHandler(resolveController, controllers)` | Builds a `queue` export handler that dispatches to `@QueueConsumer` methods |
| `getQueueProducerBindings(target)` | Returns registered queue producer bindings |
| `getQueueConsumers(target)` | Returns registered queue consumer handlers |

---

## 13. Cron Triggers (@Scheduled)

Run code on a schedule using Cloudflare Workers Cron Triggers with the
`@Scheduled()` decorator.

### Basic Usage

Decorate a controller method with `@Scheduled()` and provide a cron
expression. The method is automatically called on the defined schedule.

```ts
// health.controller.ts
import { Controller, Scheduled } from '@varbyte/nest-worker';

@Controller()
export class HealthController {
  @Scheduled({ cron: '0 * * * *' })
  async healthCheck() {
    console.log('Health check running (every hour)');
    // Perform periodic checks
  }
}
```

### Multiple Handlers

Register multiple `@Scheduled()` handlers in the same or different
controllers — all matching handlers run on every scheduled tick.

```ts
import { Controller, Scheduled } from '@varbyte/nest-worker';

@Controller()
export class ScheduledTasksController {

  @Scheduled({ cron: '0 * * * *', name: 'hourly-cleanup' })
  async hourlyCleanup() {
    // Runs at the start of every hour
    await this.cleanupService.removeOldRecords();
  }

  @Scheduled({ cron: '0 0 * * *', name: 'daily-report' })
  async dailyReport() {
    // Runs at midnight every day
    await this.reportService.generateDaily();
  }

  @Scheduled({
    cron: '0 0 * * 0',
    name: 'weekly-maintenance',
    timeout: '10 minutes',
  })
  async weeklyMaintenance() {
    // Runs at midnight on Sunday
    await this.maintenanceService.run();
  }
}
```

### Wiring the Scheduled Handler

Export a `scheduled` handler from your worker entry-point alongside the
fetch handler:

```ts
// worker.ts
import 'reflect-metadata';
import {
  Module, createApplication, createScheduledHandler,
} from '@varbyte/nest-worker';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
class AppModule {}

const app = createApplication(AppModule);

export default {
  fetch: app.handler.fetch,
  scheduled: createScheduledHandler(
    (cls) => app.container.resolveController(cls),
    app.container.getControllers(),
  ),
};
```

### wrangler.toml Configuration

Add the cron trigger to `wrangler.toml`:

```toml
name = "my-scheduled-worker"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[triggers]]
crons = ["0 * * * *", "0 0 * * *"]
```

### Decorator Reference

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Scheduled(options)` | Method | Registers a cron trigger handler. `options.cron` is the cron expression; `name` and `timeout` are optional. |

### Utility Functions

| Function | Description |
|----------|-------------|
| `createScheduledHandler(resolveController, controllers)` | Builds a `scheduled` export handler that dispatches to all `@Scheduled()` methods |
| `getScheduledHandlers(target)` | Returns registered scheduled handlers for a class |

---

## 14. Static Assets (@ServeStatic)

Serve static files (SPA, images, CSS) directly from your Cloudflare Worker
using Workers Sites or any KV/FILES namespace binding.

### Middleware (App-Level)

Use `serveStaticAssets()` as a global middleware to serve files from a
Workers Sites `bucket`:

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication, serveStaticAssets } from '@varbyte/nest-worker';

@Module({})
class AppModule {}

const app = createApplication(AppModule);

app.use(serveStaticAssets({
  root: '/assets',
  index: 'index.html',
  contentBinding: '__STATIC_CONTENT',
}));

export default app.handler;
```

### Decorator (@ServeStatic)

Apply `@ServeStatic()` to a controller method to serve files from a specific
root. The method body runs as a fallback when no matching file is found:

```ts
// assets.controller.ts
import { Controller, ServeStatic } from '@varbyte/nest-worker';

@Controller()
export class AssetsController {
  @ServeStatic({ root: '/public', index: 'index.html' })
  serve() {
    // Fallback when file not found
    return new Response('Not Found', { status: 404 });
  }
}
```

### SPA Fallback

When a requested file is not found, the middleware automatically serves the
`index.html` file (SPA fallback). Disable this with `index: false`:

```ts
app.use(serveStaticAssets({
  root: '/',
  index: false,  // no SPA fallback
}));
```

### wrangler.toml Configuration

Configure Workers Sites in `wrangler.toml`:

```toml
name = "my-static-worker"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[site]
bucket = "./public"
entry-point = "workers-site"
```

Files in the `public/` directory are uploaded and served via
`env.__STATIC_CONTENT` at runtime.

### Decorator Reference

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@ServeStatic(options?)` | Method | Registers a GET route that serves static files from a Workers Sites binding |

### Middleware Reference

| Function | Description |
|----------|-------------|
| `serveStaticAssets(options?)` | Middleware that serves static files from a Workers Sites binding (supports `root`, `index`, `contentBinding`) |
| `getServeStaticEntries(target)` | Returns registered `@ServeStatic()` entries for a class |

---

## Migration Guide (v0.x → v0.1+)

### Breaking Changes

1. **Module encapsulation is now enforced** — non-exported providers from imported modules are no longer accessible. Export them explicitly:
   ```ts
   @Module({
     providers: [MyService],
     exports: [MyService], // ← required now
   })
   ```
2. **`useValue` and `useFactory` providers are now properly handled** — If you were using them before, they may not have worked correctly. They now work as expected.

3. **Middleware signature changed** — Middlewares now receive `ctx: ExecutionContext` as third parameter:
   ```ts
   // Old
   const mw: MiddlewareFn = async (req, env) => { ... };
   // New
   const mw: MiddlewareFn = async (req, env, ctx) => { ... };
   ```

4. **`(req as any).__corsHeaders` is removed** — If you were manually reading this property, use `getCorsHeaders(req)` instead.

---

## Need Help?

- [GitHub Issues](https://github.com/varbyte-dev/nest-worker/issues)
- [npm Package](https://www.npmjs.com/package/@varbyte/nest-worker)
