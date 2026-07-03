# nest-worker Examples 🪺

> 📖 [Documentación completa](https://varbyte-dev.github.io/nest-worker-docs/)


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

# Generar WebSocket, Colas, Cron y Assets Estáticos
nest-worker generate websocket chat
nest-worker generate queue notifications
nest-worker generate scheduled daily-report
nest-worker generate static-assets

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
| `nest-worker generate swagger` | Archivo de configuración de Swagger/OpenAPI |
| `nest-worker generate websocket <nombre>` | Controlador de WebSocket upgrade |
| `nest-worker generate queue <nombre>` | Par productor/consumidor de colas |
| `nest-worker generate scheduled <nombre>` | Controlador de tareas programadas (cron) |
| `nest-worker generate static-assets` | Controlador de archivos estáticos con SPA fallback |

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
9. [Documentación Swagger / OpenAPI](#9-documentación-swagger--openapi)
10. [Ejemplo de aplicación completa](#10-ejemplo-de-aplicación-completa)
11. [WebSocket y Durable Objects](#11-websocket-y-durable-objects)
12. [Productor y Consumidor de Colas](#12-productor-y-consumidor-de-colas)
13. [Tareas Programadas (@Scheduled)](#13-tareas-programadas-scheduled)
14. [Archivos Estáticos (@ServeStatic)](#14-archivos-estáticos-servestatic)

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
// 5. Pipes del controlador (@UsePipe en la clase)
// 6. Pipes de la ruta (@UsePipe en el método)
// 7. Handler de la ruta

app
  .use(logger())       // 1º
  .use(cors());        // 2º

@Controller('items')
@UseMiddleware(mw1)    // 3º — aplica a todas las rutas del controlador
export class ItemsController {
  @Get()
  @UseMiddleware(mw2)  // 4º — solo para esta ruta
  @UsePipe(pipe1)      // 6º — valida/transforma argumentos resueltos
  list() {
    // 7º
    return { items: [] };
  }
}
```

Si algún middleware retorna un `Response`, la cadena se detiene inmediatamente.

### Pipes de validación

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

## 9. Documentación Swagger / OpenAPI

Genera documentación interactiva de la API automáticamente con Swagger UI.

### Configuración

Usa `app.useSwagger()` para habilitar la documentación con protección opcional Basic Auth:

```typescript
import { createApplication, Module, cors, logger } from '@varbyte/nest-worker';

@Module({ controllers: [UsersController], providers: [UsersService] })
class AppModule {}

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({ origin: "*" }))
  .useSwagger({
    title: 'Mi API',
    version: '1.0.0',
    description: 'Documentación de la API',
    path: '/docs',                              // default: /docs
    auth: {                                      // Basic Auth opcional
      username: 'admin',
      password: process.env.SWAGGER_PASSWORD || 'secreto',
    },
    servers: [
      { url: 'https://api.example.com', description: 'Producción' },
    ],
  });

export default app.handler;
```

Abre `/docs` en tu navegador para ver la interfaz de Swagger. La spec JSON de OpenAPI está disponible en `/docs/json`.

### Decorando DTOs con `@ApiModel()` y `@Prop()`

Documenta tus modelos de datos con un decorador por clase y uno por propiedad:

```typescript
import { ApiModel, Prop } from '@varbyte/nest-worker';

@ApiModel({ description: 'Modelo de datos de usuario' })
class User {
  @Prop() id!: number;
  @Prop({ description: 'Nombre completo' }) name!: string;
  @Prop({ description: 'Correo electrónico', example: 'user@example.com' }) email!: string;
  @Prop({ description: 'Rol del usuario', example: 'user' }) role!: string;
  @Prop() created_at!: string;
}

@ApiModel({ description: 'Payload para crear un usuario' })
class CreateUserDto {
  @Prop() name!: string;
  @Prop() email!: string;
  @Prop({ description: 'Por defecto: "user"' }) role?: string;
}
```

### Describiendo Endpoints (Opcional)

Usa decoradores opcionales para enriquecer la documentación generada:

```typescript
import {
  Controller, Get, Post, Body, Param,
  ApiTags, ApiOperation, ApiResponse,
} from '@varbyte/nest-worker';

@ApiTags('Usuarios')
@Controller('users')
export class UsersController {
  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID', description: 'Retorna un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getOne(@Param('id') id: string) {
    // ...
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  async create(@Body() body: CreateUserDto) {
    // ...
  }
}
```

El schema del body y los modelos de respuesta se detectan automáticamente desde `@Body()` y `design:returntype`. Cuando usas `@ApiModel()` + `@Prop()` en tus DTOs, el schema completo aparece en Swagger UI con tipos, descripciones y ejemplos.

### Auth con Bearer Token (🔒 ícono de candado)

Para mostrar el botón **Authorize** y los íconos de candado en endpoints protegidos:

```typescript
import {
  createApplication,
  SecuritySchemes, ApiSecurity,
  ApiTags, Controller, Get, Req, UseMiddleware,
} from '@varbyte/nest-worker';
import { AuthGuard, getAuthUser } from '@varbyte/nest-worker-auth';

// 1. Declarar el esquema en useSwagger()
app.useSwagger({
  securitySchemes: {
    bearerAuth: SecuritySchemes.bearerJwt(),
    // apiKey: SecuritySchemes.apiKey(),     // también disponible
    // basic:  SecuritySchemes.basicAuth(),  // también disponible
  },
});

const guard = AuthGuard.jwt({ strategy: 'jwt', secretEnvKey: 'JWT_SECRET' });

// 2a. Proteger todo el controlador con @ApiSecurity
@ApiSecurity('bearerAuth')   // 🔒 aplica a TODOS los métodos
@ApiTags('Perfil')
@Controller('profile')
export class ProfileController {
  @Get()
  @UseMiddleware(guard)
  getPerfil(@Req() req: Request) {
    return getAuthUser(req);
  }
}

// 2b. O proteger solo un método específico
@ApiTags('Items')
@Controller('items')
export class ItemsController {
  @Get()
  listar() { return []; }            // público, sin candado

  @Get('mios')
  @ApiSecurity('bearerAuth')         // 🔒 solo este método
  @UseMiddleware(guard)
  listarMios(@Req() req: Request) { return []; }
}
```

**En Swagger UI:**
1. Haz clic en **Authorize** (botón verde, arriba a la derecha)
2. Pega tu Bearer token (sin el prefijo `Bearer `)
3. Haz clic en **Authorize** — todos los endpoints 🔒 envían el token automáticamente
4. El token se mantiene al recargar la página (`persistAuthorization: true`)

### Generador CLI

```bash
# Generar un archivo de configuración de swagger
nest-worker generate swagger

# Detectar automáticamente controladores y DTOs, agregar decoradores
nest-worker generate swagger --detect

# Todo en uno: generar config + detectar + habilitar en worker.ts
nest-worker generate swagger --detect --update-worker
```

#### Opciones

| Bandera | Descripción |
|---------|-------------|
| `--detect` | Escanea todos los controladores y DTOs, agrega automáticamente `@ApiTags()`, `@ApiOperation()`, `@ApiModel()`, `@Prop()` donde falten |
| `--update-worker` | Habilita Swagger automáticamente en `src/worker.ts` |
| `--title <nombre>` | Título de la API (default: "My API") |
| `--version <ver>` | Versión de la API (default: "1.0.0") |
| `--path <ruta>` | Ruta de Swagger UI (default: "/docs") |
| `--no-auth` | Deshabilitar autenticación Basic Auth |
| `-f, --force` | Sobrescribir archivo de configuración existente |

Al ejecutar `--detect`, la CLI:
1. Escanea `src/modules/**/*.controller.ts` en busca de controladores
2. Agrega `@ApiTags('NombreClase')` si falta
3. Agrega `@ApiOperation({ summary: '...' })` para cada ruta
4. Escanea `src/modules/**/*.dto.ts` en busca de DTOs
5. Agrega decoradores `@ApiModel()` y `@Prop()` a los DTOs
6. Infiere tipos de propiedades desde las anotaciones de TypeScript

Los recursos recién generados (`nest-worker generate resource`) ya incluyen `@ApiTags()`, `@ApiOperation()`, `@ApiModel()` y `@Prop()` por defecto.

---

## 10. Ejemplo de aplicación completa

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

## 11. WebSocket y Durable Objects

Construye aplicaciones bidireccionales en tiempo real en el edge con
manejadores de actualización WebSocket y Durable Objects con estado.

### Manejador de WebSocket

Usa `@WebSocket()` para marcar un método de controlador como un endpoint
de actualización WebSocket. El método recibe la `Request` de actualización
y devuelve una `Response` con `status: 101` y una propiedad `webSocket`.

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
      // Echo del mensaje
      server.send(`Echo: ${event.data}`);
    });

    server.addEventListener('close', () => {
      console.log('Conexión cerrada');
    });

    return wsUpgradeResponse(client);
  }
}
```

Registra el controlador en tu módulo como siempre:

```ts
// worker.ts
import 'reflect-metadata';
import { Module, createApplication } from '@varbyte/nest-worker';
import { WsController } from './ws.controller';

@Module({ controllers: [WsController] })
class AppModule {}

export default createApplication(AppModule).handler;
```

La ruta WebSocket usa `GET` por defecto y el router automáticamente
pasa las respuestas `101` sin envolverlas con CORS u otras transformaciones.

### Durable Object con ciclo de vida WebSocket

Para aplicaciones en tiempo real con estado (salas de chat, sesiones de
juego, colaboración en vivo), usa `@DurableObject()` con los decoradores
de ciclo de vida `@OnOpen()`, `@OnMessage()` y `@OnClose()`.

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

  /** Requerido — Workers llama fetch() en el DO para cada solicitud upgrade */
  async fetch(request: Request): Promise<Response> {
    return handleWebSocketLifecycle(this, request);
  }

  @OnOpen()
  onOpen(connection: WebSocket) {
    this.sessions.push(connection);
    connection.send(JSON.stringify({
      type: 'system',
      message: `¡Bienvenido! ${this.sessions.length} usuario(s) conectados.`,
    }));
  }

  @OnMessage()
  onMessage(connection: WebSocket, message: string | ArrayBuffer) {
    // Broadcast a todas las sesiones conectadas
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

Configura el Durable Object en `wrangler.toml`:

```toml
name = "mi-app-tiempo-real"
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

Registra la clase DO como provider en tu módulo y crea el endpoint
HTTP que actualiza las conexiones:

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
    const doId = env.CHAT_ROOM.idFromName('sala-principal');
    const stub = env.CHAT_ROOM.get(doId);
    return stub.fetch(req);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatRoom],  // Registra la clase DO
})
class AppModule {}

export default createApplication(AppModule).handler;
```

### Decoradores Disponibles

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@WebSocket(path?)` | Método | Marca un método como manejador de actualización WebSocket (ruta `GET` con `isWebSocket: true`) |
| `@DurableObject()` | Clase | Marca una clase como Durable Object con gestión de estado |
| `@OnOpen()` | Método | Maneja nuevas conexiones WebSocket dentro de una clase `@DurableObject()` |
| `@OnMessage()` | Método | Maneja mensajes entrantes dentro de una clase `@DurableObject()` |
| `@OnClose()` | Método | Maneja cierre de conexión dentro de una clase `@DurableObject()` |

### Funciones de Utilidad

| Función | Descripción |
|----------|-------------|
| `wsUpgradeResponse(webSocket)` | Crea una `Response` con `status: 101` y el `webSocket` dado |
| `handleWebSocketLifecycle(instance, request)` | Conecta los manejadores `@OnOpen`/`@OnMessage`/`@OnClose` dentro del `fetch()` del DO |
| `isWebSocketRoute(route)` | Devuelve `true` si una `RouteDefinition` es un manejador WebSocket |
| `isDurableObjectClass(target)` | Devuelve `true` si una clase está decorada con `@DurableObject()` |
| `getWsEvents(target)` | Devuelve los eventos de ciclo de vida WebSocket registrados para una clase |

---

## 12. Productor y Consumidor de Colas

Integra Cloudflare Queues para producción y consumo confiable de mensajes
en el edge.

### Productor (@QueueProducer)

Usa `@QueueProducer()` para inyectar un productor de cola tipado:

```ts
// notification.service.ts
import { Injectable, QueueProducer, QueueProducerType } from '@varbyte/nest-worker';

@Injectable()
export class NotificationService {
  @QueueProducer('QUEUE')
  declare queue: QueueProducerType;

  async sendWelcome(userId: string, email: string) {
    await this.queue.send({ type: 'welcome', userId, email });
  }

  async sendBulk(users: Array<{ userId: string; email: string }>) {
    await this.queue.sendBatch(
      users.map((u) => ({ body: { type: 'welcome', ...u } })),
    );
  }
}
```

El binding `declare` es requerido — el decorador `@QueueProducer` solo
proporciona metadatos; el binding real es inyectado por Cloudflare en
el entorno de ejecución de Workers.

#### Nombre de Binding Personalizado

Si tu `wrangler.toml` usa un nombre de binding diferente a `QUEUE`:

```ts
@QueueProducer('EMAIL_QUEUE')
declare emailQueue: QueueProducerType;
```

### Consumidor (@QueueConsumer)

Usa `@QueueConsumer()` en un método del controlador para recibir mensajes
de una cola:

```ts
// notification.consumer.ts
import { Controller, QueueConsumer } from '@varbyte/nest-worker';

@Controller()
export class NotificationConsumer {
  @QueueConsumer('notifications', { batchSize: 5, maxRetries: 3 })
  async handle(batch: MessageBatch) {
    for (const msg of batch.messages) {
      const { type, userId, email } = msg.body as any;
      console.log(`Procesando: ${type} para ${email}`);
      // TODO: enviar email, actualizar DB, etc.
    }
  }
}
```

### Configuración del Manejador de Colas

Conecta todo en `worker.ts`:

```ts
// worker.ts
import 'reflect-metadata';
import {
  Module,
  createApplication,
  createQueueHandler,
} from '@varbyte/nest-worker';
import { NotificationService } from './notification.service';
import { NotificationConsumer } from './notification.consumer';

@Module({
  controllers: [NotificationConsumer],
  providers: [NotificationService],
})
class AppModule {}

const app = createApplication(AppModule);

export default {
  fetch: app.handler,
  queue: createQueueHandler(app, NotificationConsumer),
};
```

### Configuración de wrangler.toml

```toml
name = "mi-app-colas"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[queues.producers]]
binding = "QUEUE"
queue = "notifications"

[[queues.consumers]]
queue = "notifications"
max_batch_size = 5
max_retries = 3
```

### Decoradores Disponibles

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@QueueProducer(name)` | Propiedad | Inyecta un binding de cola `QueueProducerType` |
| `@QueueConsumer(queueName, opts?)` | Método | Marca un método como manejador de mensajes de cola |

### Funciones de Utilidad

| Función | Descripción |
|----------|-------------|
| `createQueueHandler(app, ...controllers)` | Crea un manejador `queue()` para el export de Cloudflare Worker |

---

## 13. Tareas Programadas (@Scheduled)

Ejecuta código en horarios programados usando los Triggers de Cron
de Cloudflare Workers.

### Uso Básico

```ts
// health.scheduled.ts
import { Controller, Scheduled } from '@varbyte/nest-worker';

@Controller()
export class HealthScheduledController {
  @Scheduled({ cron: '*/5 * * * *', name: 'health-check' })
  async healthCheck() {
    console.log('Health check ejecutado:', new Date().toISOString());
    // TODO: verificar DB, servicios externos, etc.
  }
}
```

### Múltiples Manejadores

Puedes tener varios métodos `@Scheduled()` en el mismo controlador o en
diferentes controladores:

```ts
// tasks.scheduled.ts
import { Controller, Scheduled } from '@varbyte/nest-worker';

@Controller()
export class ScheduledTasksController {
  @Scheduled({ cron: '0 * * * *', name: 'hourly-cleanup' })
  async hourlyCleanup() {
    console.log('Limpiando registros antiguos...');
  }

  @Scheduled({ cron: '0 6 * * *', name: 'daily-report' })
  async dailyReport() {
    console.log('Generando reporte diario...');
  }

  @Scheduled({ cron: '0 3 * * 0', name: 'weekly-maintenance', timeout: 120_000 })
  async weeklyMaintenance() {
    console.log('Mantenimiento semanal...');
  }
}
```

### Configuración del Manejador Programado

Conecta los controladores con `createScheduledHandler`:

```ts
// worker.ts
import 'reflect-metadata';
import {
  Module,
  createApplication,
  createScheduledHandler,
} from '@varbyte/nest-worker';
import { HealthScheduledController } from './health.scheduled';

@Module({ controllers: [HealthScheduledController] })
class AppModule {}

const app = createApplication(AppModule);

export default {
  fetch: app.handler,
  scheduled: createScheduledHandler(app, [HealthScheduledController]),
};
```

### Configuración de wrangler.toml

```toml
name = "mi-app-cron"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[triggers]]
crons = ["*/5 * * * *", "0 * * * *", "0 6 * * *"]
```

### Referencia del Decorador

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@Scheduled({ cron, name?, timeout? })` | Método | Marca un método para ejecución programada. `cron` es obligatorio; `name` para identificación; `timeout` en ms (por defecto 60_000) |

### Funciones de Utilidad

| Función | Descripción |
|----------|-------------|
| `createScheduledHandler(app, controllers)` | Crea un manejador `scheduled()` para el export de Cloudflare Worker |

---

## 14. Archivos Estáticos (@ServeStatic)

Sirve archivos estáticos (HTML, CSS, JS, imágenes) directamente desde
el bucket de assets de Cloudflare Workers.

### Middleware (Nivel de App)

Agrega `serveStaticAssets` como middleware global:

```ts
// worker.ts
import 'reflect-metadata';
import {
  Module,
  createApplication,
  serveStaticAssets,
} from '@varbyte/nest-worker';

@Module({})
class AppModule {}

const app = createApplication(AppModule);

app.use(serveStaticAssets({
  root: '/public',
  index: 'index.html',
  contentBinding: '__STATIC_CONTENT',
}));

export default app.handler;
```

### Decorador (@ServeStatic)

Alternativamente, usa el decorador `@ServeStatic()` en un controlador:

```ts
// assets.controller.ts
import { Controller, ServeStatic } from '@varbyte/nest-worker';

@Controller()
export class AssetsController {
  @ServeStatic({ root: '/public', index: 'index.html' })
  serve() {
    return new Response('No encontrado', { status: 404 });
  }
}
```

### SPA Fallback

Para aplicaciones de una sola página (SPA), redirige todas las rutas no
encontradas a `index.html`:

```ts
app.use(serveStaticAssets({
  root: '/public',
  index: 'index.html',  // SPA fallback
}));
```

### Configuración de wrangler.toml

```toml
name = "mi-app-estatica"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[site]
bucket = "./public"
entry-point = "."
```

### Referencia del Decorador

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@ServeStatic({ root, index })` | Método | Sirve archivos estáticos desde un controlador. `root` es la ruta base; `index` es el archivo por defecto para SPA |

### Referencia del Middleware

| Función | Descripción |
|----------|-------------|
| `serveStaticAssets({ root, index, contentBinding? })` | Middleware global que sirve archivos estáticos antes de enrutar |

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
