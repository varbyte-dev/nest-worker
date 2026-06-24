# nest-worker 🪺

> Mini framework estilo NestJS para **Cloudflare Workers** con soporte nativo para **D1**.

[![npm version](https://img.shields.io/npm/v/@varbyte/nest-worker)](https://www.npmjs.com/package/@varbyte/nest-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Características

- **Decoradores** — `@Controller`, `@Get`, `@Post`, `@Body`, `@Param`, `@D1`, etc.
- **Módulos** — organiza tu app en módulos con `@Module`
- **Inyección de dependencias** — `@Injectable` + inyección por constructor
- **D1 integrado** — `@D1()` inyecta el binding, `D1Repository` y `QueryBuilder` listos para usar
- **Middlewares** — CORS, logger, rate limiting, bearer auth incluidos
- **Excepciones HTTP** — `NotFoundException`, `BadRequestException`, etc.
- **Cero dependencias en runtime** — solo `reflect-metadata`
- **Protección contra SQL Injection** — todos los identificadores se sanitizan automáticamente

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
| `nest-worker generate dto <nombre>` | Generar DTOs de creación y actualización |
| `nest-worker generate provider <nombre>` | Generar un provider personalizado |
| `nest-worker generate migration <desc>` | Generar una migración SQL |
| `nest-worker generate seed <nombre>` | Generar un seed SQL |
| `nest-worker generate env <var>` | Agregar variable de entorno a `wrangler.toml` |
| `nest-worker info` | Mostrar información del proyecto y framework |
| `nest-worker list` | Listar recursos generados |
| `nest-worker doctor` | Diagnosticar problemas de configuración |

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
  .use(logger())
  .use(cors({ origin: 'https://mi-dominio.com' }))
  .use(rateLimit({ windowMs: 60_000, max: 100 }));
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

// Rate limiting por IP
rateLimit({ windowMs: 60_000, max: 60 })

// Bearer Token auth
bearerAuth({ tokenEnvKey: 'API_SECRET' })   // lee env.API_SECRET
bearerAuth({ staticToken: 'mi-token' })     // token fijo (dev only)
```

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
