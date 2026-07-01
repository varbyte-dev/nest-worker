# nest-worker 🪺

> Mini framework estilo NestJS para **Cloudflare Workers** con soporte nativo para **D1**.
> 📖 [Documentación completa](https://varbyte-dev.github.io/nest-worker-docs/)

[![npm version](https://img.shields.io/npm/v/@varbyte/nest-worker)](https://www.npmjs.com/package/@varbyte/nest-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentación](https://img.shields.io/badge/docs-sitio-blue)](https://varbyte-dev.github.io/nest-worker-docs/)

---

## Características

- **Decoradores** — `@Controller`, `@Get`, `@Post`, `@Body`, `@Param`, `@D1`, etc.
- **Módulos** — organiza tu app en módulos con `@Module`
- **Inyección de dependencias** — `@Injectable` + inyección por constructor
- **D1 integrado** — `@D1()` inyecta el binding, `D1Repository` y `QueryBuilder` listos para usar
- **Middlewares** — CORS, logger, rate limiting, bearer auth incluidos
- **Excepciones HTTP** — `NotFoundException`, `BadRequestException`, etc.
- **Swagger / OpenAPI** — documentación de API auto-generada con decoradores `@ApiModel()` y `@Prop()`, servida vía Swagger UI con Basic Auth opcional
- **Cero dependencias en runtime** — solo `reflect-metadata`
- **Protección contra SQL Injection** — todos los identificadores se sanitizan automáticamente

---

## Política de mantenimiento

Las decisiones de API pública y releases siguen
[docs/API_RELEASE_POLICY.md](docs/API_RELEASE_POLICY.md). Revisa esta política
antes de cambiar exports, decoradores, código generado, comandos de CLI,
comportamiento documentado o notas de release.

---

## CLI — `@varbyte/nest-worker-cli`

Acelera tu desarrollo con la CLI oficial:

```bash
npm install -g @varbyte/nest-worker-cli
# o ejecuta directamente
npx @varbyte/nest-worker-cli
```

### Comandos

| Comando | Descripción |
|---------|-------------|
| `nest-worker new <nombre>` | Crear un nuevo proyecto |
| `nest-worker generate module <nombre>` | Generar un módulo |
| `nest-worker generate controller <nombre>` | Generar un controlador con rutas CRUD |
| `nest-worker generate service <nombre>` | Generar un servicio inyectable |
| `nest-worker generate resource <nombre>` | Generar un recurso CRUD completo (módulo + controlador + servicio + repositorio + modelo + DTOs + migración) |
| `nest-worker generate guard <nombre>` | Generar un guardia de autenticación |
| `nest-worker generate middleware <nombre>` | Generar un middleware personalizado |
| `nest-worker generate exception <nombre>` | Generar una excepción HTTP personalizada (flag `--status`) |
| `nest-worker generate filter <nombre>` | Generar un filtro de errores |
| `nest-worker generate repository <nombre>` | Generar un repositorio D1 |
| `nest-worker generate model <nombre>` | Generar una interfaz de modelo |
| `nest-worker generate dto <nombre>` | Generar DTOs con decoradores `@ApiModel()` |
| `nest-worker generate provider <nombre>` | Generar un provider personalizado |
| `nest-worker generate migration <desc>` | Generar una migración SQL |
| `nest-worker generate seed <nombre>` | Generar un seed SQL |
| `nest-worker generate env <var>` | Agregar variable de entorno a `wrangler.toml` |
| `nest-worker generate swagger` | Generar configuración de Swagger/OpenAPI con detección automática |
| `nest-worker generate websocket <nombre>` | Generar un controlador WebSocket |
| `nest-worker generate queue <nombre>` | Generar un par productor/consumidor de colas |
| `nest-worker generate scheduled <nombre>` | Generar un controlador de tareas programadas (cron) |
| `nest-worker generate static-assets` | Generar un controlador de archivos estáticos |
| `nest-worker info` | Mostrar información del proyecto y framework |
| `nest-worker list` | Listar recursos generados |
| `nest-worker doctor` | Diagnosticar problemas de configuración |

### Swagger / OpenAPI con Detección Automática

La CLI puede escanear tus controladores y DTOs existentes para generar documentación Swagger automáticamente:

```bash
# Generar configuración Swagger y detectar decoradores automáticamente
nest-worker generate swagger --detect --update-worker

# Iniciar servidor de desarrollo
npm run dev

# Abrir http://localhost:8787/docs en el navegador
```

La bandera `--detect`:
1. Escanea todos los controladores en `src/modules/`
2. Agrega `@ApiTags()` a los controladores (si falta)
3. Agrega `@ApiOperation()` con resúmenes auto-generados para cada ruta
4. Escanea archivos DTO y agrega decoradores `@ApiModel()` y `@Prop()`
5. Infiere tipos de propiedades desde anotaciones TypeScript

La bandera `--update-worker` actualiza automáticamente `src/worker.ts` para habilitar Swagger.

### Ejemplo rápido

```bash
# Crear un nuevo proyecto
nest-worker new my-api
cd my-api
npm install

# Generar un recurso CRUD completo
nest-worker generate resource users

# Iniciar desarrollo
npm run dev
```

---

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install @varbyte/nest-worker reflect-metadata
npm install -D typescript wrangler @cloudflare/workers-types
```

### 2. Configurar `tsconfig.json`

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

### 3. Crear tu Worker

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

### 4. Configurar `wrangler.toml`

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

## Decoradores

### Módulos

```ts
@Module({
  imports: [OtherModule],      // importar otros módulos
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],     // opcional
})
class AppModule {}
```

### Controladores y rutas

```ts
@Controller('users')           // prefijo de ruta → /users
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()                       // GET /users
  getAll() { ... }

  @Get(':id')                  // GET /users/:id
  getOne(@Param('id') id: string) { ... }

  @Post()                      // POST /users
  @HttpCode(201)               // status de éxito custom
  create(@Body() body: CreateUserDto) { ... }

  @Put(':id')                  // PUT /users/:id
  update(@Param('id') id: string, @Body() body: UpdateUserDto) { ... }

  @Delete(':id')               // DELETE /users/:id
  remove(@Param('id') id: string) { ... }
}
```

### Parámetros de handler

| Decorador | Descripción |
|-----------|-------------|
| `@Body()` | Body completo del request (JSON) |
| `@Body('campo')` | Un campo específico del body |
| `@Param('id')` | Path parameter |
| `@Query('page')` | Query string parameter |
| `@Headers('authorization')` | Header específico |
| `@Req()` | Request completo |
| `@D1()` | Binding D1 (env.DB por defecto) |
| `@D1('MY_DB')` | Binding D1 con clave personalizada |
| `@Env()` | Objeto env completo |
| `@Env('MY_SECRET')` | Variable de entorno específica |

### Status de respuesta

Usa `@HttpCode()` cuando un handler debe devolver un status de éxito específico
y aún quieres que el framework serialice el resultado.

```ts
@Post()
@HttpCode(201)
create(@Body() body: CreateUserDto) {
  return this.users.create(body);
}
```

### Servicios

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

## WebSocket y Durable Objects

Construye aplicaciones bidireccionales en tiempo real en el edge.

### Decoradores

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@WebSocket(path?)` | Método | Marca un método como endpoint de actualización WebSocket |
| `@DurableObject()` | Clase | Marca una clase como Durable Object con gestión de estado |
| `@OnOpen()` | Método | Maneja nuevas conexiones WebSocket dentro de una clase `@DurableObject()` |
| `@OnMessage()` | Método | Maneja mensajes entrantes dentro de una clase `@DurableObject()` |
| `@OnClose()` | Método | Maneja cierre de conexión dentro de una clase `@DurableObject()` |

### Utilidades

| Función | Descripción |
|----------|-------------|
| `wsUpgradeResponse(webSocket)` | Crea una `Response` con `status: 101` y el `webSocket` dado |
| `handleWebSocketLifecycle(instance, request)` | Conecta los manejadores `@OnOpen`/`@OnMessage`/`@OnClose` dentro del `fetch()` del DO |

### Ejemplo rápido

```ts
import { Controller, WebSocket, wsUpgradeResponse } from '@varbyte/nest-worker';

@Controller('ws')
export class WsController {
  @WebSocket('/echo')
  handleEcho() {
    const [client, server] = new WebSocketPair();
    server.accept();
    server.addEventListener('message', (event) => {
      server.send(`Echo: ${event.data}`);
    });
    return wsUpgradeResponse(client);
  }
}
```

---

## Productor y Consumidor de Colas

Integra Cloudflare Queues para producción y consumo confiable de mensajes.

### Decoradores

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@QueueProducer(bindingName)` | Propiedad | Inyecta un binding de cola (`QueueProducerType`) |
| `@QueueConsumer(queueName, opts?)` | Método | Marca un método como manejador de mensajes de cola |

### Utilidades

| Función | Descripción |
|----------|-------------|
| `createQueueHandler(app, controllers)` | Crea un manejador `queue()` para el export de Cloudflare Worker |

### Ejemplo rápido

```ts
import { Injectable, QueueProducer, QueueProducerType } from '@varbyte/nest-worker';

@Injectable()
export class NotificationService {
  @QueueProducer('QUEUE')
  declare queue: QueueProducerType;

  async send(payload: Record<string, unknown>) {
    await this.queue.send(payload);
  }
}
```

```ts
import { Controller, QueueConsumer } from '@varbyte/nest-worker';

@Controller()
export class NotificationConsumer {
  @QueueConsumer('notifications', { batchSize: 5, maxRetries: 3 })
  async handle(batch: MessageBatch) {
    for (const msg of batch.messages) {
      console.log('Procesando:', msg.body);
    }
  }
}
```

Conexión en `worker.ts`:

```ts
import { createApplication, createQueueHandler } from '@varbyte/nest-worker';

const app = createApplication(AppModule);

export default {
  fetch: app.handler,
  queue: createQueueHandler(
    (cls) => app.container.resolveController(cls),
    [NotificationConsumer],
  ),
};
```

---

## Tareas Programadas (@Scheduled)

Ejecuta código en horarios programados usando Workers Cron Triggers.

### Decorador

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@Scheduled({ cron, name?, timeout? })` | Método | Marca un método para ejecución programada. `cron` es obligatorio; `name` para identificación; `timeout` en ms (por defecto 60_000) |

### Utilidades

| Función | Descripción |
|----------|-------------|
| `createScheduledHandler(app, controllers)` | Crea un manejador `scheduled()` para el export de Cloudflare Worker |

### Ejemplo rápido

```ts
import { Controller, Scheduled } from '@varbyte/nest-worker';

@Controller()
export class HealthScheduledController {
  @Scheduled({ cron: '*/5 * * * *', name: 'health-check' })
  async healthCheck() {
    console.log('Health check ejecutado:', new Date().toISOString());
  }
}
```

Conexión en `worker.ts`:

```ts
import { createApplication, createScheduledHandler } from '@varbyte/nest-worker';

const app = createApplication(AppModule);

export default {
  fetch: app.handler,
  scheduled: createScheduledHandler(
    (cls) => app.container.resolveController(cls),
    [HealthScheduledController],
  ),
};
```

---

## Archivos Estáticos (@ServeStatic)

Sirve archivos estáticos (HTML, CSS, JS, imágenes) desde tu bucket de Workers Sites.

### Decorador y Middleware

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@ServeStatic({ root, index })` | Método | Sirve archivos estáticos desde un controlador. `root` es la ruta base; `index` es el archivo SPA fallback |

| Función | Descripción |
|----------|-------------|
| `serveStaticAssets({ root, index, contentBinding? })` | Middleware global que sirve archivos estáticos antes de enrutar |

### Ejemplo rápido

```ts
// Middleware (nivel de app)
import { serveStaticAssets } from '@varbyte/nest-worker';

app.use(serveStaticAssets({ root: '/public', index: 'index.html' }));
```

```ts
// Decorador (nivel de controlador)
import { Controller, ServeStatic } from '@varbyte/nest-worker';

@Controller()
export class AssetsController {
  @ServeStatic({ root: '/public', index: 'index.html' })
  serve() {
    return new Response('No encontrado', { status: 404 });
  }
}
```

---

## Swagger / OpenAPI

Genera automáticamente documentación de API con Swagger UI, protegida por Basic Auth.

### Configuración

```ts
import { createApplication } from '@varbyte/nest-worker';
import type { SwaggerOptions } from '@varbyte/nest-worker';

const app = createApplication(AppModule);

app.useSwagger({
  title: 'My API',
  version: '1.0.0',
  description: 'Documentación de la API',
  auth: {
    username: 'admin',
    password: 'swagger-secret',  // Usa variable de entorno en producción
  },
  servers: [
    { url: 'https://api.example.com', description: 'Producción' },
  ],
} satisfies SwaggerOptions);
```

Visita `/docs` en tu navegador para ver la interfaz de Swagger UI.

### Decoradores

| Decorador | Objetivo | Descripción |
|-----------|----------|-------------|
| `@ApiModel({ description })` | Clase | Marca una clase como modelo/esquema de OpenAPI |
| `@Prop({ description?, example? })` | Propiedad | Describe una propiedad del modelo |
| `@ApiOperation({ summary, description })` | Método | Describe una operación de endpoint |
| `@ApiResponse({ status, description })` | Método | Describe una respuesta de endpoint |
| `@ApiTags(name)` | Clase | Agrupa endpoints por etiqueta |
| `@ApiBody({ description, type })` | Método | Describe el cuerpo de la solicitud |

---

## D1 — Base de datos

### D1Repository

Clase base con operaciones CRUD listas para usar:

```ts
const repo = new D1Repository<User>(db, 'users');

// CRUD básico
await repo.findAll();
await repo.findById(1);
await repo.findWhere({ role: 'admin' });
await repo.findOneWhere({ email: 'alice@example.com' });
await repo.create({ name: 'Alice', email: 'alice@example.com', role: 'user' });
await repo.update(1, { name: 'Alice Updated' });
await repo.delete(1);
await repo.count({ role: 'admin' });

// Queries personalizadas
await repo.raw('SELECT * FROM users WHERE created_at > ?', '2024-01-01');
await repo.rawFirst('SELECT * FROM users WHERE email = ?', 'alice@example.com');
```

> **Seguridad:** Todos los nombres de columnas y tablas se sanitizan automáticamente contra SQL injection. Los métodos `raw()` y `rawFirst()` dependen de bindings parametrizados.

### QueryBuilder

Para queries más complejas con interfaz fluida:

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

### Inyectar D1 en controladores

```ts
@Get()
async getAll(@D1() db: D1Database) {
  // db = env.DB automáticamente
  const repo = new D1Repository(db, 'users');
  return repo.findAll();
}

// Con binding personalizado
@Get()
async getData(@D1('ANALYTICS_DB') db: D1Database) {
  // db = env.ANALYTICS_DB
}
```

---

## Middlewares

### Globales (en la app)

```ts
app
  .use(requestLogger())
  .use(cors({ origin: 'https://mi-dominio.com' }))
  .use(devRateLimit({ windowMs: 60_000, max: 100 }));
```

### Por controlador o ruta

```ts
@Controller('admin')
@UseMiddleware(bearerAuth({ tokenEnvKey: 'ADMIN_TOKEN' }))  // aplica a todas las rutas
export class AdminController {

  @Delete(':id')
  @UseMiddleware(bearerAuth({ staticToken: 'super-secret' }))  // solo esta ruta
  remove(@Param('id') id: string) { ... }
}
```

### Middlewares disponibles

```ts
// CORS
cors({ origin: '*', methods: ['GET', 'POST'], credentials: false })
cors({ origin: ['https://app.example', 'https://admin.example'] })
cors({ origin: (origin) => origin.endsWith('.trusted.example') })

// Las credenciales requieren un origen explícito, nunca '*'
cors({ origin: 'https://app.example', credentials: true })

// Logger (consola)
logger()

// Logger de request/response con request ids
requestLogger()
requestLogger({
  json: true,
  requestIdHeader: 'X-Request-Id',
  formatError: (error) => ({ name: 'DomainError', message: 'redacted' }),
  sink: (entry) => console.log(entry),
})

// Rate limiting por IP
devRateLimit({ windowMs: 60_000, max: 60 })

// Bearer Token auth
bearerAuth({ tokenEnvKey: 'API_SECRET' })   // lee env.API_SECRET
bearerAuth({ staticToken: 'mi-token' })     // token fijo (dev only)
```

> **Rate limiting:** `devRateLimit()` usa estado en memoria. Es útil para
> desarrollo local y tests, pero no es un rate limiter durable ni globalmente
> consistente en Cloudflare Workers. Para producción, usa Durable Objects, KV
> entendiendo sus tradeoffs de consistencia, o controles de la plataforma
> Cloudflare. El export anterior `rateLimit()` queda como alias de compatibilidad
> deprecado.

> **Logging:** `logger()` conserva el log original de inicio de request.
> Usa `requestLogger()` cuando necesitas request ids, status final de respuesta
> duración de request y resúmenes de errores manejados en logs más adecuados
> para producción.

### Middleware personalizado

```ts
import { MiddlewareFn } from '@varbyte/nest-worker';

const myMiddleware: MiddlewareFn = async (req, env, ctx) => {
  const token = req.headers.get('X-Api-Key');
  if (!token) {
    return new Response('No autorizado', { status: 401 });
  }
  // Si no retorna Response, continúa al siguiente middleware/handler
};
```

### Pipes de validación

Los pipes se ejecutan después de resolver los parámetros del handler y antes de
llamar al método del controlador. Úsalos para validar o transformar argumentos
sin agregar una librería de validación al core del framework.

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

Para validación común de body, usa `validateBody()` y mantén el pipe pequeño y
sin dependencias:

```ts
@Post()
@UsePipe(validateBody<{ name?: unknown }>((body) => {
  if (typeof body.name !== 'string') return 'name is required';
}))
create(@Body() body: { name: string }) {
  return this.users.create(body);
}
```

`createValidationPipe()` puede envolver cualquier función validadora, incluyendo
adaptadores a librerías de schemas que decidas instalar en tu app. El framework
no agrega una dependencia de validación.

---

## Excepciones HTTP

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

// En cualquier handler o servicio
throw new NotFoundException('Usuario no encontrado');
throw new BadRequestException('Email inválido', { field: 'email' });
throw new HttpException('Error custom', 422);

// El framework las captura y responde automáticamente con el status correcto
```

Las excepciones HTTP usan un envelope JSON estable:

```json
{
  "error": "Usuario no encontrado",
  "statusCode": 404
}
```

Registra filtros globales de error cuando una aplicación necesita mapear errores
a respuestas custom. Los filtros pueden retornar un `Response`; si no retornan
nada, el framework conserva su fallback estable.

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

> **Seguridad en producción:** Cuando `APP_ENV` está configurado como `"production"`, los errores internos inesperados devuelven un mensaje genérico en lugar de filtrar detalles del error.

---

## Respuestas del handler

El framework convierte automáticamente lo que retornas:

| Retorno | Respuesta |
|---------|-----------|
| `objeto` / `array` | `200 JSON` |
| `string` | `200 text/plain` |
| `undefined` / `null` | `204 No Content` |
| `Response` | Se usa tal cual |
| `throw HttpException` | Status correspondiente en JSON |
| `@HttpCode(n)` | Usa `n` para respuestas exitosas serializadas |

---

## Inyección de dependencias

### Tipos de providers

| Tipo | Ejemplo | Descripción |
|------|---------|-------------|
| Clase | `MyService` | Auto-instanciado con `new` |
| `useClass` | `{ provide: TOKEN, useClass: MyService }` | Alias a otra clase |
| `useValue` | `{ provide: 'CONFIG', useValue: { key: 'val' } }` | Valor estático |
| `useFactory` | `{ provide: TOKEN, useFactory: (dep) => dep.init(), inject: [Dep] }` | Función factoría |

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

## Estructura de proyecto recomendada

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
├── worker.ts               # Entrypoint principal
├── wrangler.toml
├── tsconfig.json
└── package.json
```

### Ejemplo con módulos separados

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

## Comandos D1

```bash
# Crear base de datos
wrangler d1 create my-app-db

# Ejecutar migración
wrangler d1 execute my-app-db --file=./migrations/001_init.sql

# Seed de datos
wrangler d1 execute my-app-db --file=./migrations/002_seed.sql

# Query directa
wrangler d1 execute my-app-db --command="SELECT * FROM users"

# Dev local (D1 incluido)
wrangler dev

# Deploy
wrangler deploy

# Secretos
wrangler secret put API_SECRET
```

---

## Licencia

MIT © [Daniel Vargas](https://github.com/varbyte-dev)
