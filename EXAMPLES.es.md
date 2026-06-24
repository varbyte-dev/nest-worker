# nest-worker Ejemplos 🪺

## CLI - Uso

Todos los ejemplos a continuación se pueden generar automáticamente usando `@varbyte/nest-worker-cli`:

### Inicio rápido

```bash
# Instalar la CLI
npm install -g @varbyte/nest-worker-cli

# Crear un nuevo proyecto
nest-worker new my-api

# Generar un recurso CRUD completo
nest-worker generate resource users
nest-worker generate resource posts
nest-worker generate resource comments

# Generar guardias y middlewares
nest-worker generate guard admin
nest-worker generate middleware request-timer

# Ver lo que se generó
nest-worker list
nest-worker doctor
```

Esto creará la estructura del proyecto, controladores, servicios, repositorios, DTOs y migraciones automáticamente.

Referencia completa de comandos:

| Comando | Qué genera |
|---------|------------|
| `nest-worker new <nombre>` | Scaffolding completo del proyecto con wrangler.toml, tsconfig, entry point, health check, middlewares, etc. |
| `nest-worker generate resource <nombre>` | Módulo + Controlador + Servicio + Repositorio + Modelo + DTOs Creación/Actualización + Migración |
| `nest-worker generate guard <nombre>` | Guardia de autenticación con `MiddlewareFn` |
| `nest-worker generate middleware <nombre>` | Función middleware personalizada |
| `nest-worker generate exception <nombre>` | Subclase personalizada de `HttpException` |
| `nest-worker generate filter <nombre>` | Filtro middleware para capturar errores |
| `nest-worker generate migration <desc>` | Archivo de migración SQL con timestamp |

---

> Una colección completa de ejemplos para `@varbyte/nest-worker`.
> Ver este archivo en: [English](EXAMPLES.md) · [Español](EXAMPLES.es.md)

---

## Índice

1. [Configuración básica](#1-configuración-básica)
2. [Controladores y rutas](#2-controladores-y-rutas)
3. [Inyección de dependencias](#3-inyección-de-dependencias)
4. [Módulos y encapsulamiento](#4-módulos-y-encapsulamiento)
5. [Base de datos (D1)](#5-base-de-datos-d1)
6. [Middlewares](#6-middlewares)
7. [Excepciones HTTP y manejo de errores](#7-excepciones-http-y-manejo-de-errores)
8. [Tipos de providers (useClass / useValue / useFactory)](#8-tipos-de-providers)
9. [Ejemplo de aplicación completa](#9-ejemplo-de-aplicación-completa)

---

## 1. Configuración básica

### Instalación

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

### Worker mínimo

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication } from '@varbyte/nest-worker';

@Module({})
class AppModule {}

export default createApplication(AppModule).handler;
```

Este es el mínimo absoluto — responde con `404 Not Found` a toda petición.

---

## 2. Controladores y rutas

### Controlador básico

```ts
// hello.controller.ts
import { Controller, Get } from '@varbyte/nest-worker';

@Controller('hello')
export class HelloController {
  @Get()
  hello() {
    return { message: '¡Hola, Mundo!' };
  }

  @Get(':name')
  greet(@Param('name') name: string) {
    return { message: `¡Hola, ${name}!` };
  }
}
```

### Controlador REST completo

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
  list(@Query('category') category?: string) {
    const filtered = category
      ? this.items.filter((i) => i.name.includes(category))
      : this.items;
    return { data: filtered, total: filtered.length };
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.items.find((i) => i.id === Number(id));
  }

  @Post()
  create(@Body() body: { name: string; price: number }) {
    const item: Item = { id: this.nextId++, ...body };
    this.items.push(item);
    return item;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Item>) {
    const item = this.items.find((i) => i.id === Number(id));
    if (item) Object.assign(item, body);
    return item;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const idx = this.items.findIndex((i) => i.id === Number(id));
    if (idx !== -1) this.items.splice(idx, 1);
    return { success: idx !== -1 };
  }
}
```

### Usando Request y Headers

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

## 3. Inyección de dependencias

### Inyección básica de servicios

```ts
// greeting.service.ts
import { Injectable } from '@varbyte/nest-worker';

@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `¡Hola, ${name}!`;
  }

  farewell(name: string): string {
    return `¡Adiós, ${name}!`;
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

### Servicio con múltiples dependencias

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
    this.logger.log('Buscando todos los usuarios');
    const maxResults = this.config.get('MAX_USERS', 100);
    return { users: [], maxResults };
  }
}
```

---

## 4. Módulos y encapsulamiento

### Módulo de funcionalidad

```ts
// users/users.module.ts
import { Module } from '@varbyte/nest-worker';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // disponible para otros módulos
})
export class UsersModule {}
```

### Módulo con helpers internos

```ts
// auth/auth.module.ts
import { Module } from '@varbyte/nest-worker';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenHelper } from './token.helper';       // interno, no exportado
import { PasswordHasher } from './password.hasher';   // interno, no exportado

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenHelper, PasswordHasher],
  exports: [AuthService], // solo AuthService es visible externamente
})
export class AuthModule {}
```

### Módulo raíz con imports

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

## 5. Base de datos (D1)

### D1Repository - CRUD completo

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
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
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
    await this.findById(db, id);
    await this.getRepo(db).update(id, data);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number) {
    await this.findById(db, id);
    await this.getRepo(db).delete(id);
    return { message: `Usuario #${id} eliminado` };
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

### QueryBuilder - Consultas avanzadas

```ts
import { QueryBuilder, D1Database } from '@varbyte/nest-worker';

// Consulta fluida básica
const users = await new QueryBuilder<User>(db, 'users')
  .select('id', 'name', 'email')
  .where('role', 'admin')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .all();

// Con operador LIKE
const search = await new QueryBuilder(db, 'users')
  .where('name', '%juan%', 'LIKE')
  .all();

// Conteo con condiciones
const count = await new QueryBuilder(db, 'users')
  .where('role', 'admin')
  .where('active', 1)
  .count();

// Operadores explícitos multi-valor y null
const activeAdmins = await new QueryBuilder<User>(db, 'users')
  .whereIn('role', ['admin', 'owner'])
  .whereNotIn('status', ['blocked', 'pending'])
  .whereNull('deleted_at')
  .whereBetween('created_at', '2026-01-01', '2026-12-31')
  .all();

// Paginación
const page = await new QueryBuilder(db, 'users')
  .orderBy('created_at', 'DESC')
  .limit(20)
  .offset(40)
  .all();

// Primer resultado
const admin = await new QueryBuilder<User>(db, 'users')
  .where('role', 'admin')
  .first();
```

### Inyectar D1 en controladores

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

// Con múltiples bases de datos D1
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

### Usando @Env para configuración

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
    return { secret: secret ? '***configurado***' : 'no configurado' };
  }
}
```

---

## 6. Middlewares

### Middlewares globales

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
    origin: 'https://miapp.com',
    methods: ['GET', 'POST'],
    credentials: true,
  }))
  .use(devRateLimit({
    windowMs: 60_000,  // 1 minuto
    max: 100,          // 100 peticiones por minuto
  }));

export default app.handler;
```

> `devRateLimit()` usa memoria local y está pensado para desarrollo/tests. No
> es production-safe en Cloudflare Workers; para producción usa Durable Objects,
> KV entendiendo sus tradeoffs de consistencia, o controles de la plataforma
> Cloudflare.

### Auth por ruta con Bearer Token

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
    return { message: `Usuario #${id} eliminado` };
  }
}
```

### Middleware personalizado

```ts
// middlewares/api-key.ts
import { MiddlewareFn } from '@varbyte/nest-worker';

export const apiKeyAuth = (validKeys: string[]): MiddlewareFn => {
  return async (req, env, ctx) => {
    const key = req.headers.get('X-API-Key');
    if (!key) {
      return new Response(JSON.stringify({ error: 'API key requerida' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!validKeys.includes(key)) {
      return new Response(JSON.stringify({ error: 'API key inválida' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};
```

### Orden de ejecución de middlewares

```ts
// Orden de ejecución:
// 1. logger (global)
// 2. cors (global)
// 3. Middlewares del controlador (@UseMiddleware en la clase)
// 4. Middlewares de la ruta (@UseMiddleware en el método)
// 5. Handler de la ruta

app
  .use(logger())       // 1º
  .use(cors());        // 2º

@Controller('items')
@UseMiddleware(mw1)    // 3º — aplica a todas las rutas del controlador
export class ItemsController {
  @Get()
  @UseMiddleware(mw2)  // 4º — solo para esta ruta
  list() {
    // 5º
    return { items: [] };
  }
}
```

Si algún middleware retorna un `Response`, la cadena se detiene inmediatamente.

---

## 7. Excepciones HTTP y manejo de errores

### Todas las excepciones disponibles

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
throw new BadRequestException('Entrada inválida');
throw new BadRequestException('El email ya existe', { field: 'email', value: 'test@test.com' });

// 401 Unauthorized
throw new UnauthorizedException('Credenciales inválidas');

// 403 Forbidden
throw new ForbiddenException('Permisos insuficientes');

// 404 Not Found
throw new NotFoundException('Usuario #42 no encontrado');

// 409 Conflict
throw new ConflictException('El nombre de usuario ya existe');

// 500 Internal Server Error
throw new InternalServerErrorException('Error de conexión a base de datos');

// Código personalizado
throw new HttpException('Servicio no disponible', 503);
```

### Manejo de excepciones en servicios

```ts
@Injectable()
export class OrderService {
  async findById(db: D1Database, id: number) {
    const order = await new D1Repository(db, 'orders').findById(id);
    if (!order) {
      throw new NotFoundException(`Orden #${id} no encontrada`);
    }
    return order;
  }

  async placeOrder(db: D1Database, data: any) {
    if (!data.items?.length) {
      throw new BadRequestException('La orden debe tener al menos un artículo');
    }
    if (data.total < 0) {
      throw new BadRequestException('Monto total inválido', { total: data.total });
    }
    return new D1Repository(db, 'orders').create(data);
  }
}
```

---

## 8. Tipos de providers

### useClass — Alias a una clase

```ts
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
}

class FileLogger implements Logger {
  log(message: string) { /* escribir a archivo */ }
}

@Module({
  providers: [
    { provide: 'Logger', useClass: ConsoleLogger },
  ],
})
class AppModule {}

// Para inyectar: @Inject('Logger')
```

### useValue — Valores estáticos / Configuración

```ts
// config.ts
export const APP_CONFIG = {
  appName: 'MiWorker',
  version: '1.0.0',
  maxConnections: 10,
  features: {
    darkMode: true,
    beta: false,
  },
};

// módulo
@Module({
  providers: [
    { provide: 'APP_CONFIG', useValue: APP_CONFIG },
    { provide: 'API_BASE_URL', useValue: 'https://api.ejemplo.com/v2' },
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

### useFactory — Providers dinámicos

```ts
// Factoría con dependencias
@Module({
  providers: [
    D1Repository,
    {
      provide: 'USER_REPO',
      useFactory: (db: D1Database) => new D1Repository<User>(db, 'users'),
      inject: [D1Repository],
    },
    {
      provide: 'CONFIG',
      useFactory: () => {
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

---

## 9. Ejemplo de aplicación completa

### API de gestión de usuarios

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
// user.service.ts
import { Injectable, NotFoundException, BadRequestException, D1Repository, D1Database } from '@varbyte/nest-worker';

@Injectable()
export class UserService {
  async findAll(db: D1Database) {
    return new D1Repository(db, 'users').findAll();
  }

  async findById(db: D1Database, id: number) {
    const user = await new D1Repository(db, 'users').findById(id);
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return user;
  }

  async create(db: D1Database, data: { name: string; email: string; role?: string }) {
    if (!data.name?.trim()) throw new BadRequestException('El nombre es requerido');
    if (!data.email?.trim()) throw new BadRequestException('El email es requerido');
    const existing = await new D1Repository(db, 'users').findOneWhere({ email: data.email });
    if (existing) throw new BadRequestException('El email ya está en uso');
    const result = await new D1Repository(db, 'users').create(data as any);
    return { id: result.meta.last_row_id!, ...data };
  }

  async update(db: D1Database, id: number, data: any) {
    await this.findById(db, id);
    await new D1Repository(db, 'users').update(id, data);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number) {
    await this.findById(db, id);
    await new D1Repository(db, 'users').delete(id);
    return { message: `Usuario #${id} eliminado` };
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
    return q
      ? new D1Repository(db, 'users').raw('SELECT * FROM users WHERE name LIKE ?', `%${q}%`)
      : this.userService.findAll(db);
  }

  @Get(':id')
  async get(@D1() db: D1Database, @Param('id') id: string) {
    return this.userService.findById(db, parseInt(id));
  }

  @Post()
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async create(@D1() db: D1Database, @Body() body: any) {
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
      return { status: 'ok', timestamp: new Date().toISOString(), environment: env.APP_ENV || 'unknown' };
    } catch {
      return { status: 'degradado', database: 'no disponible' };
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
app.use(logger()).use(cors({ origin: '*' })).use(devRateLimit({ windowMs: 60_000, max: 60 }));

export default app.handler;
```

---

## Guía de migración (v0.x → v0.1+)

### Cambios importantes

1. **El encapsulamiento de módulos ahora se aplica** — los providers no exportados de módulos importados ya no son accesibles. Exprésalos explícitamente:
   ```ts
   @Module({
     providers: [MyService],
     exports: [MyService], // ← ahora requerido
   })
   ```
2. **`useValue` y `useFactory` ahora funcionan correctamente** — Si los usabas antes, es posible que no funcionaran adecuadamente. Ahora funcionan como se espera.

3. **La firma de Middleware cambió** — Los middlewares ahora reciben `ctx: ExecutionContext` como tercer parámetro:
   ```ts
   // Antes
   const mw: MiddlewareFn = async (req, env) => { ... };
   // Ahora
   const mw: MiddlewareFn = async (req, env, ctx) => { ... };
   ```

4. **`(req as any).__corsHeaders` fue eliminado** — Si leías esta propiedad manualmente, usa `getCorsHeaders(req)` en su lugar.

---

## ¿Necesitas ayuda?

- [GitHub Issues](https://github.com/varbyte-dev/nest-worker/issues)
- [npm Package](https://www.npmjs.com/package/@varbyte/nest-worker)
