# nest-worker Examples 🪺

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
9. [Complete Application Example](#9-complete-application-example)

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

## 9. Complete Application Example

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
