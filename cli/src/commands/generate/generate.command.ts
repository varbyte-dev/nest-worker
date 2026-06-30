import { Command } from "commander";
import pc from "picocolors";
import { resolve } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  parseName,
  pluralize,
  moduleDirName,
  fileName,
  NameInfo,
} from "../../utils/naming.js";
import {
  ensureDir,
  createFile,
  createFileSafe,
  exists,
  migrationTimestamp,
} from "../../utils/file-system.js";
import { detectProject, findProjectRoot } from "../../utils/project.js";
import { escapeRegex } from "../../utils/regex.js";
import {
  scanControllers,
  scanDTOs,
  addSwaggerImport,
  addApiModelToDTO,
  addPropToDTOProperties,
  addApiTagsToController,
  addApiOperationToHandler,
  DetectedController,
  DetectedDTO,
} from "../../utils/swagger-detector.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function projectGuard(): string {
  const root = findProjectRoot();
  const project = detectProject(root);
  if (!project.hasNestWorker) {
    console.error(pc.red("\n  ✗ Not inside a @varbyte/nest-worker project.\n"));
    console.error(
      pc.dim(
        `  Run ${pc.cyan("nest-worker new <name>")} to create one, or navigate to an existing project.\n`,
      ),
    );
    process.exit(1);
  }
  return root;
}

function successSummary(files: string[], label: string): void {
  console.log(pc.green(`\n  ✓ ${label}\n`));
  for (const f of files) {
    console.log(`    ${pc.dim("└─")} ${pc.cyan(f)}`);
  }
  console.log("");
}

function pluralKebab(info: NameInfo): string {
  return pluralize(info.kebab);
}

function ensureModuleDir(root: string, name: string): string {
  const dir = resolve(root, "src", "modules", moduleDirName(name));
  return dir;
}

function ensureCommonDir(root: string, sub: string): string {
  const dir = resolve(root, "src", "common", sub);
  return dir;
}

function writeFileWithForce(
  filePath: string,
  content: string,
  force: boolean,
): boolean {
  if (exists(filePath) && !force) {
    return false;
  }
  writeFileSync(filePath, content, "utf-8");
  return true;
}

// ========================================================================
//  MODULE
// ========================================================================

function createModuleCommand(): Command {
  const cmd = new Command("module");
  cmd.description("Generate a NestModule class");
  cmd.argument("<name>", "Module name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const relDir = `src/modules/${moduleDirName(name)}`;
    const modFile = fileName(info, "module.ts");
    const modPath = resolve(dir, modFile);
    const relPath = `${relDir}/${modFile}`;

    await ensureDir(dir);

    const content = buildModuleTemplate(info);
    const created = writeFileWithForce(modPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Module "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildModuleTemplate(info: NameInfo): string {
  const moduleName = `${info.pascal}Module`;
  return `import { Module } from '@varbyte/nest-worker';

@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class ${moduleName} {}
`;
}

// ========================================================================
//  CONTROLLER
// ========================================================================

function createControllerCommand(): Command {
  const cmd = new Command("controller");
  cmd.description("Generate a controller with CRUD routes");
  cmd.argument("<name>", "Controller name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const relDir = `src/modules/${moduleDirName(name)}`;
    const ctrlFile = fileName(info, "controller.ts");
    const ctrlPath = resolve(dir, ctrlFile);
    const relPath = `${relDir}/${ctrlFile}`;

    await ensureDir(dir);

    const content = buildControllerTemplate(info);
    const created = writeFileWithForce(ctrlPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Controller "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildControllerTemplate(info: NameInfo): string {
  const pluralPath = pluralKebab(info);
  const serviceName = `${info.pascal}Service`;
  const serviceVar = `${info.camel}Service`;
  const serviceFile = `./${info.kebab}.service`;

  return `import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  D1,
  ApiTags,
  ApiOperation,
} from '@varbyte/nest-worker';
import type { D1Database } from '@varbyte/nest-worker';
import { ${serviceName} } from '${serviceFile}.js';

@ApiTags('${info.pascal}')
@Controller('${pluralPath}', [${serviceName}])
export class ${info.pascal}Controller {
  constructor(private readonly ${serviceVar}: ${serviceName}) {}

  @Get()
  @ApiOperation({ summary: 'List all ${pluralPath}' })
  async findAll(@D1() db: D1Database, @Query('page') page?: string) {
    const p = page ? parseInt(page, 10) : 1;
    return this.${serviceVar}.findAll(db, p);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ${info.human} by ID' })
  async findOne(@D1() db: D1Database, @Param('id') id: string) {
    return this.${serviceVar}.findById(db, parseInt(id, 10));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new ${info.human.toLowerCase()}' })
  async create(
    @D1() db: D1Database,
    @Body() body: Record<string, unknown>,
  ) {
    return this.${serviceVar}.create(db, body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update ${info.human} by ID' })
  async update(
    @D1() db: D1Database,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.${serviceVar}.update(db, parseInt(id, 10), body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete ${info.human} by ID' })
  async remove(@D1() db: D1Database, @Param('id') id: string) {
    return this.${serviceVar}.delete(db, parseInt(id, 10));
  }
}
`;
}

// ========================================================================
//  SERVICE
// ========================================================================

function createServiceCommand(): Command {
  const cmd = new Command("service");
  cmd.description("Generate an injectable service");
  cmd.argument("<name>", "Service name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const relDir = `src/modules/${moduleDirName(name)}`;
    const svcFile = fileName(info, "service.ts");
    const svcPath = resolve(dir, svcFile);
    const relPath = `${relDir}/${svcFile}`;

    await ensureDir(dir);

    const content = buildServiceTemplate(info);
    const created = writeFileWithForce(svcPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Service "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildServiceTemplate(info: NameInfo): string {
  const repoName = `${info.pascal}Repository`;
  const repoVar = `${info.camel}Repository`;
  const repoFile = `./${info.kebab}.repository`;
  const entityName = info.pascal;
  const tableName = pluralKebab(info).replace(/-/g, "_");

  return `import { Injectable, NotFoundException } from '@varbyte/nest-worker';
import type { D1Database } from '@varbyte/nest-worker';
import { ${repoName} } from '${repoFile}.js';
import type { ${entityName} } from './${info.kebab}.model.js';

@Injectable()
export class ${info.pascal}Service {
  private getRepo(db: D1Database): ${repoName} {
    return new ${repoName}(db);
  }

  async findAll(db: D1Database, page = 1): Promise<{ data: ${entityName}[]; total: number }> {
    const repo = this.getRepo(db);
    const [data, total] = await Promise.all([
      repo.findAll(),
      repo.count(),
    ]);
    return { data, total };
  }

  async findById(db: D1Database, id: number): Promise<${entityName}> {
    const item = await this.getRepo(db).findById(id);
    if (!item) throw new NotFoundException(\`${entityName} #\${id} not found\`);
    return item;
  }

  async create(db: D1Database, data: Record<string, unknown>): Promise<{ id: number; message: string }> {
    const result = await this.getRepo(db).create(data as Omit<${entityName}, 'id'>);
    return { id: result.meta.last_row_id!, message: '${entityName} created' };
  }

  async update(db: D1Database, id: number, data: Record<string, unknown>): Promise<${entityName}> {
    await this.findById(db, id);
    await this.getRepo(db).update(id, data as Partial<Omit<${entityName}, 'id'>>);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number): Promise<{ message: string }> {
    await this.findById(db, id);
    await this.getRepo(db).delete(id);
    return { message: \`${entityName} #\${id} deleted\` };
  }
}
`;
}

// ========================================================================
//  RESOURCE  (full CRUD — module + controller + service + dto + repository + model + migration)
// ========================================================================

function createResourceCommand(): Command {
  const cmd = new Command("resource");
  cmd.description(
    "Generate a full CRUD resource (module, controller, service, dto, repository, model, migration)",
  );
  cmd.argument("<name>", "Resource name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const dtoDir = resolve(dir, "dto");
    const relDir = `src/modules/${moduleDirName(name)}`;
    const dtoRelDir = `${relDir}/dto`;
    const force = opts.force ?? false;

    await ensureDir(dir);
    await ensureDir(dtoDir);

    // ── migration ──
    const migrationDir = resolve(root, "src", "database", "migrations");
    await ensureDir(migrationDir);

    const tableName = pluralKebab(info).replace(/-/g, "_");
    const ts = migrationTimestamp();
    const migrationFile = `${ts}_create_${tableName}.sql`;
    const migrationPath = resolve(migrationDir, migrationFile);
    const migrationRel = `src/database/migrations/${migrationFile}`;

    // ── files to generate ──
    const files: { rel: string; abs: string; content: string }[] = [
      {
        rel: `${relDir}/${fileName(info, "module.ts")}`,
        abs: resolve(dir, fileName(info, "module.ts")),
        content: buildResourceModuleTemplate(info),
      },
      {
        rel: `${relDir}/${fileName(info, "controller.ts")}`,
        abs: resolve(dir, fileName(info, "controller.ts")),
        content: buildResourceControllerTemplate(info),
      },
      {
        rel: `${relDir}/${fileName(info, "service.ts")}`,
        abs: resolve(dir, fileName(info, "service.ts")),
        content: buildResourceServiceTemplate(info),
      },
      {
        rel: `${relDir}/${fileName(info, "repository.ts")}`,
        abs: resolve(dir, fileName(info, "repository.ts")),
        content: buildRepositoryTemplate(info),
      },
      {
        rel: `${relDir}/${fileName(info, "model.ts")}`,
        abs: resolve(dir, fileName(info, "model.ts")),
        content: buildModelTemplate(info),
      },
      {
        rel: `${dtoRelDir}/create-${info.kebab}.dto.ts`,
        abs: resolve(dtoDir, `create-${info.kebab}.dto.ts`),
        content: buildCreateDtoTemplate(info),
      },
      {
        rel: `${dtoRelDir}/update-${info.kebab}.dto.ts`,
        abs: resolve(dtoDir, `update-${info.kebab}.dto.ts`),
        content: buildUpdateDtoTemplate(info),
      },
      {
        rel: migrationRel,
        abs: migrationPath,
        content: buildMigrationTemplate(info),
      },
    ];

    const created: string[] = [];
    const skipped: string[] = [];

    for (const f of files) {
      const written = writeFileWithForce(f.abs, f.content, force);
      if (written) created.push(f.rel);
      else skipped.push(f.rel);
    }

    if (created.length > 0) {
      successSummary(created, `Resource "${info.pascal}" created`);
    }
    if (skipped.length > 0) {
      console.log(pc.yellow(`  ⚠  Skipped (use --force to overwrite):`));
      for (const s of skipped) {
        console.log(`    ${pc.dim("└─")} ${pc.yellow(s)}`);
      }
      console.log("");
    }
  });
  return cmd;
}

function buildResourceModuleTemplate(info: NameInfo): string {
  const controllerName = `${info.pascal}Controller`;
  const serviceName = `${info.pascal}Service`;
  const repositoryName = `${info.pascal}Repository`;
  const moduleName = `${info.pascal}Module`;
  const controllerFile = `./${info.kebab}.controller`;
  const serviceFile = `./${info.kebab}.service`;
  const repositoryFile = `./${info.kebab}.repository`;

  return `import { Module } from '@varbyte/nest-worker';
import { ${controllerName} } from '${controllerFile}.js';
import { ${serviceName} } from '${serviceFile}.js';
import { ${repositoryName} } from '${repositoryFile}.js';

@Module({
  controllers: [${controllerName}],
  providers: [${serviceName}, ${repositoryName}],
  exports: [${serviceName}, ${repositoryName}],
})
export class ${moduleName} {}
`;
}

function buildResourceControllerTemplate(info: NameInfo): string {
  const pluralPath = pluralKebab(info);
  const serviceName = `${info.pascal}Service`;
  const serviceVar = `${info.camel}Service`;

  return `import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  D1,
  UsePipe,
  validateBody,
  ApiTags,
  ApiOperation,
} from '@varbyte/nest-worker';
import type { D1Database } from '@varbyte/nest-worker';
import { ${serviceName} } from './${info.kebab}.service.js';
import { Create${info.pascal}Dto } from './dto/create-${info.kebab}.dto.js';
import { Update${info.pascal}Dto } from './dto/update-${info.kebab}.dto.js';

const validateCreate${info.pascal} = validateBody<Create${info.pascal}Dto>((body) => {
  if (!body || typeof body !== 'object') return 'Request body is required';
});

const validateUpdate${info.pascal} = validateBody<Update${info.pascal}Dto>((body) => {
  if (!body || typeof body !== 'object') return 'Request body is required';
});

@ApiTags('${info.pascal}')
@Controller('${pluralPath}', [${serviceName}])
export class ${info.pascal}Controller {
  constructor(private readonly ${serviceVar}: ${serviceName}) {}

  @Get()
  @ApiOperation({ summary: 'List all ${pluralPath}', description: 'Paginated list of ${info.human.toLowerCase()} resources' })
  async findAll(@D1() db: D1Database, @Query('page') page?: string) {
    const p = page ? parseInt(page, 10) : 1;
    return this.${serviceVar}.findAll(db, p);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ${info.human} by ID', description: 'Retrieve a single ${info.human.toLowerCase()} by its ID' })
  async findOne(@D1() db: D1Database, @Param('id') id: string) {
    return this.${serviceVar}.findById(db, parseInt(id, 10));
  }

  @Post()
  @UsePipe(validateCreate${info.pascal})
  @ApiOperation({ summary: 'Create a new ${info.human.toLowerCase()}' })
  async create(
    @D1() db: D1Database,
    @Body() body: Create${info.pascal}Dto,
  ) {
    return this.${serviceVar}.create(db, body as unknown as Record<string, unknown>);
  }

  @Put(':id')
  @UsePipe(validateUpdate${info.pascal})
  @ApiOperation({ summary: 'Update ${info.human} by ID' })
  async update(
    @D1() db: D1Database,
    @Param('id') id: string,
    @Body() body: Update${info.pascal}Dto,
  ) {
    return this.${serviceVar}.update(db, parseInt(id, 10), body as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete ${info.human} by ID' })
  async remove(@D1() db: D1Database, @Param('id') id: string) {
    return this.${serviceVar}.delete(db, parseInt(id, 10));
  }
}
`;
}

function buildResourceServiceTemplate(info: NameInfo): string {
  const repoName = `${info.pascal}Repository`;
  const repoVar = `${info.camel}Repository`;
  const entityName = info.pascal;

  return `import { Injectable, NotFoundException } from '@varbyte/nest-worker';
import type { D1Database } from '@varbyte/nest-worker';
import { ${repoName} } from './${info.kebab}.repository.js';
import type { ${entityName} } from './${info.kebab}.model.js';

@Injectable()
export class ${info.pascal}Service {
  private getRepo(db: D1Database): ${repoName} {
    return new ${repoName}(db);
  }

  async findAll(db: D1Database, page = 1): Promise<{ data: ${entityName}[]; total: number }> {
    const repo = this.getRepo(db);
    const [data, total] = await Promise.all([
      repo.findAll(),
      repo.count(),
    ]);
    return { data, total };
  }

  async findById(db: D1Database, id: number): Promise<${entityName}> {
    const item = await this.getRepo(db).findById(id);
    if (!item) throw new NotFoundException(\`${entityName} #\${id} not found\`);
    return item;
  }

  async create(db: D1Database, data: Record<string, unknown>): Promise<{ id: number; message: string }> {
    const result = await this.getRepo(db).create(data as Omit<${entityName}, 'id'>);
    return { id: result.meta.last_row_id!, message: '${entityName} created' };
  }

  async update(db: D1Database, id: number, data: Record<string, unknown>): Promise<${entityName}> {
    await this.findById(db, id);
    await this.getRepo(db).update(id, data as Partial<Omit<${entityName}, 'id'>>);
    return this.findById(db, id);
  }

  async delete(db: D1Database, id: number): Promise<{ message: string }> {
    await this.findById(db, id);
    await this.getRepo(db).delete(id);
    return { message: \`${entityName} #\${id} deleted\` };
  }
}
`;
}

// ========================================================================
//  GUARD
// ========================================================================

function createGuardCommand(): Command {
  const cmd = new Command("guard");
  cmd.description("Generate an auth guard middleware");
  cmd.argument("<name>", "Guard name (e.g. admin)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureCommonDir(root, "guards");
    const relDir = `src/common/guards`;
    const guardFile = `${info.kebab}.guard.ts`;
    const guardPath = resolve(dir, guardFile);
    const relPath = `${relDir}/${guardFile}`;

    await ensureDir(dir);

    const content = buildGuardTemplate(info);
    const created = writeFileWithForce(guardPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Guard "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildGuardTemplate(info: NameInfo): string {
  const guardName = `${info.pascal}Guard`;

  return `import type { MiddlewareFn } from '@varbyte/nest-worker';

/**
 * ${info.human} guard — returns 401/403 if the request is not authorized.
 */
export function ${info.camel}Guard(options?: { tokenEnvKey?: string; staticToken?: string }): MiddlewareFn {
  const { tokenEnvKey = 'API_SECRET', staticToken } = options ?? {};

  return (req, env, _ctx) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.slice(7);
    const expected = staticToken ?? (env[tokenEnvKey] as string | undefined);

    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
`;
}

// ========================================================================
//  MIDDLEWARE
// ========================================================================

function createMiddlewareCommand(): Command {
  const cmd = new Command("middleware");
  cmd.description("Generate a middleware function");
  cmd.argument("<name>", "Middleware name (e.g. request-logger)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureCommonDir(root, "middlewares");
    const relDir = `src/common/middlewares`;
    const mwFile = `${info.kebab}.middleware.ts`;
    const mwPath = resolve(dir, mwFile);
    const relPath = `${relDir}/${mwFile}`;

    await ensureDir(dir);

    const content = buildMiddlewareTemplate(info);
    const created = writeFileWithForce(mwPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Middleware "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildMiddlewareTemplate(info: NameInfo): string {
  const mwName = `${info.camel}Middleware`;

  return `import type { MiddlewareFn } from '@varbyte/nest-worker';

/**
 * ${info.human} middleware.
 * Modify the request, log, or short-circuit the response.
 */
export function ${mwName}(options?: Record<string, unknown>): MiddlewareFn {
  return async (req, env, ctx) => {
    const url = new URL(req.url);
    console.log(
      \`[\${new Date().toISOString()}] [${info.kebab}] \${req.method} \${url.pathname}\`,
    );
    // TODO: implement your middleware logic
  };
}
`;
}

// ========================================================================
//  EXCEPTION
// ========================================================================

function createExceptionCommand(): Command {
  const cmd = new Command("exception");
  cmd.description("Generate a custom HttpException class");
  cmd.argument("<name>", "Exception name (e.g. payment-required)");
  cmd.option("-s, --status <code>", "HTTP status code (default: 400)", "400");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(
    async (name: string, opts: { force?: boolean; status?: string }) => {
      const root = projectGuard();
      const info = parseName(name);
      const dir = ensureCommonDir(root, "exceptions");
      const relDir = `src/common/exceptions`;
      const exFile = `${info.kebab}.exception.ts`;
      const exPath = resolve(dir, exFile);
      const relPath = `${relDir}/${exFile}`;

      await ensureDir(dir);

      const content = buildExceptionTemplate(info, opts.status);
      const created = writeFileWithForce(exPath, content, opts.force ?? false);

      if (created) {
        successSummary([relPath], `Exception "${info.pascal}" created`);
      } else {
        console.log(
          pc.yellow(
            `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
          ),
        );
      }
    },
  );
  return cmd;
}

function buildExceptionTemplate(info: NameInfo, statusCode?: string): string {
  const className = `${info.pascal}Exception`;
  const code = statusCode || "400";

  return `import { HttpException } from '@varbyte/nest-worker';

/**
 * ${info.human} exception — thrown when a ${info.human.toLowerCase()} error occurs.
 */
export class ${className} extends HttpException {
  constructor(message = '${info.human}', details?: unknown) {
    super(message, ${code}, details);
    this.name = '${className}';
  }
}
`;
}

// ========================================================================
//  FILTER
// ========================================================================

function createFilterCommand(): Command {
  const cmd = new Command("filter");
  cmd.description("Generate an error-handling middleware filter");
  cmd.argument("<name>", "Filter name (e.g. http-error)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureCommonDir(root, "filters");
    const relDir = `src/common/filters`;
    const filterFile = `${info.kebab}.filter.ts`;
    const filterPath = resolve(dir, filterFile);
    const relPath = `${relDir}/${filterFile}`;

    await ensureDir(dir);

    const content = buildFilterTemplate(info);
    const created = writeFileWithForce(
      filterPath,
      content,
      opts.force ?? false,
    );

    if (created) {
      successSummary([relPath], `Filter "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildFilterTemplate(info: NameInfo): string {
  const filterName = `${info.camel}Filter`;

  return `import type { ErrorFilterFn } from '@varbyte/nest-worker';
import { HttpException } from '@varbyte/nest-worker';

/**
 * ${info.human} error filter — map handled errors to structured responses.
 *
 * Register it with:
 *   app.useErrorFilter(${filterName});
 */
export const ${filterName}: ErrorFilterFn = (error, { request }) => {
  if (!(error instanceof HttpException)) return;

  return Response.json({
    ...error.toJSON(),
    path: new URL(request.url).pathname,
    timestamp: new Date().toISOString(),
  }, { status: error.statusCode });
};
`;
}

// ========================================================================
//  REPOSITORY
// ========================================================================

function createRepositoryCommand(): Command {
  const cmd = new Command("repository");
  cmd.description("Generate a D1 repository class");
  cmd.argument("<name>", "Repository name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const relDir = `src/modules/${moduleDirName(name)}`;
    const repoFile = fileName(info, "repository.ts");
    const repoPath = resolve(dir, repoFile);
    const relPath = `${relDir}/${repoFile}`;

    await ensureDir(dir);

    const content = buildRepositoryTemplate(info);
    const created = writeFileWithForce(repoPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Repository "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildRepositoryTemplate(info: NameInfo): string {
  const entityName = info.pascal;
  const tableName = pluralKebab(info).replace(/-/g, "_");
  const className = `${info.pascal}Repository`;

  return `import { D1Repository, D1Database, Injectable } from '@varbyte/nest-worker';
import type { ${entityName} } from './${info.kebab}.model.js';

@Injectable()
export class ${className} extends D1Repository<${entityName}> {
  constructor(protected readonly db: D1Database) {
    super(db, '${tableName}');
  }
}
`;
}

// ========================================================================
//  MODEL
// ========================================================================

function createModelCommand(): Command {
  const cmd = new Command("model");
  cmd.description("Generate a model interface/type");
  cmd.argument("<name>", "Model name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = ensureModuleDir(root, name);
    const relDir = `src/modules/${moduleDirName(name)}`;
    const modelFile = fileName(info, "model.ts");
    const modelPath = resolve(dir, modelFile);
    const relPath = `${relDir}/${modelFile}`;

    await ensureDir(dir);

    const content = buildModelTemplate(info);
    const created = writeFileWithForce(modelPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Model "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildModelTemplate(info: NameInfo): string {
  const entityName = info.pascal;
  const tableName = pluralKebab(info).replace(/-/g, "_");

  return `/**
 * Represents a single row in the \`${tableName}\` table.
 */
export interface ${entityName} {
  [key: string]: unknown;
  id: number;
  // TODO: add your fields here
  created_at: string;
  updated_at?: string;
}
`;
}

// ========================================================================
//  DTO
// ========================================================================

function createDtoCommand(): Command {
  const cmd = new Command("dto");
  cmd.description("Generate create and update DTOs");
  cmd.argument("<name>", "DTO name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = resolve(ensureModuleDir(root, name), "dto");
    const relDir = `src/modules/${moduleDirName(name)}/dto`;
    const force = opts.force ?? false;

    await ensureDir(dir);

    const createFileContent = buildCreateDtoTemplate(info);
    const updateFileContent = buildUpdateDtoTemplate(info);

    const createRel = `${relDir}/create-${info.kebab}.dto.ts`;
    const updateRel = `${relDir}/update-${info.kebab}.dto.ts`;

    const createAbs = resolve(dir, `create-${info.kebab}.dto.ts`);
    const updateAbs = resolve(dir, `update-${info.kebab}.dto.ts`);

    const created: string[] = [];
    if (writeFileWithForce(createAbs, createFileContent, force)) {
      created.push(createRel);
    }
    if (writeFileWithForce(updateAbs, updateFileContent, force)) {
      created.push(updateRel);
    }

    if (created.length > 0) {
      successSummary(created, `DTOs for "${info.pascal}" created`);
    } else {
      console.log(
        pc.yellow(`\n  ⚠  DTOs already exist (use --force to overwrite)\n`),
      );
    }
  });
  return cmd;
}

function buildCreateDtoTemplate(info: NameInfo): string {
  const className = `Create${info.pascal}Dto`;

  return `import { ApiModel, Prop } from '@varbyte/nest-worker';

@ApiModel({ description: 'Payload to create a new ${info.human.toLowerCase()}' })
export class ${className} {
  @Prop({ description: 'Name of the ${info.human.toLowerCase()}', example: 'Sample' })
  name!: string;

  @Prop({ description: 'Description of the ${info.human.toLowerCase()}', example: 'A sample item' })
  description?: string;

  // TODO: add fields required for creation
}
`;
}

function buildUpdateDtoTemplate(info: NameInfo): string {
  const className = `Update${info.pascal}Dto`;

  return `import { ApiModel, Prop } from '@varbyte/nest-worker';

@ApiModel({ description: 'Payload to update an existing ${info.human.toLowerCase()}' })
export class Update${info.pascal}Dto {
  @Prop({ description: 'Name of the ${info.human.toLowerCase()}', example: 'Updated Name' })
  name?: string;

  @Prop({ description: 'Description of the ${info.human.toLowerCase()}', example: 'Updated description' })
  description?: string;

  // TODO: add optional fields for updates
}
`;
}

// ========================================================================
//  PROVIDER
// ========================================================================

function createProviderCommand(): Command {
  const cmd = new Command("provider");
  cmd.description("Generate a custom provider");
  cmd.argument("<name>", "Provider name (e.g. logger)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.option(
    "-t, --type <type>",
    "Provider type: factory | value | class",
    "factory",
  );
  cmd.action(async (name: string, opts: { force?: boolean; type: string }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = resolve(root, "src", "config", "providers");
    const relDir = `src/config/providers`;
    const provFile = `${info.kebab}.provider.ts`;
    const provPath = resolve(dir, provFile);
    const relPath = `${relDir}/${provFile}`;
    const providerType = opts.type || "factory";

    await ensureDir(dir);

    const content = buildProviderTemplate(info, providerType);
    const created = writeFileWithForce(provPath, content, opts.force ?? false);

    if (created) {
      successSummary(
        [relPath],
        `Provider "${info.pascal}" (${providerType}) created`,
      );
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

function buildProviderTemplate(info: NameInfo, type: string): string {
  const token = `${info.pascal.toUpperCase()}_TOKEN`;
  const providerName = `${info.pascal}Provider`;
  const providerClassName = `${info.pascal}ProviderClass`;
  const factoryFn = `${info.camel}Factory`;

  if (type === "value") {
    return `import type { InjectionToken } from '@varbyte/nest-worker';

/** Injection token for ${info.human.toLowerCase()} provider */
export const ${token} = '${info.camel}-provider' as unknown as InjectionToken;

/** ${info.human} provider (useValue) */
export const ${providerName} = {
  provide: ${token},
  useValue: {
    // TODO: provide the actual value
    name: '${info.human}',
  },
};
`;
  }

  if (type === "class") {
    return `import { Injectable } from '@varbyte/nest-worker';
import type { InjectionToken } from '@varbyte/nest-worker';

/** Injection token for ${info.human.toLowerCase()} provider */
export const ${token} = '${info.camel}-provider' as unknown as InjectionToken;

@Injectable()
export class ${providerClassName} {
  // TODO: implement provider behavior
}

/** ${info.human} provider (useClass) */
export const ${providerName} = {
  provide: ${token},
  useClass: ${providerClassName},
};
`;
  }

  // Default: factory
  return `import type { InjectionToken } from '@varbyte/nest-worker';
import type { WorkerEnv } from '@varbyte/nest-worker';

/** Injection token for ${info.human.toLowerCase()} provider */
export const ${token} = '${info.camel}-provider' as unknown as InjectionToken;

export interface ${info.pascal}Options {
  // TODO: define provider options
}

/**
 * Factory that creates the ${info.human.toLowerCase()} provider instance.
 */
export function ${factoryFn}(env: WorkerEnv): ${info.pascal}Options {
  return {
    // TODO: initialise from env bindings if needed
  };
}

/** ${info.human} provider (useFactory) */
export const ${providerName} = {
  provide: ${token},
  useFactory: ${factoryFn},
};
`;
}

// ========================================================================
//  MIGRATION
// ========================================================================

function createMigrationCommand(): Command {
  const cmd = new Command("migration");
  cmd.description("Generate a SQL migration file");
  cmd.argument("<desc>", "Migration description (e.g. create-users-table)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (desc: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const dir = resolve(root, "src", "database", "migrations");
    const relDir = `src/database/migrations`;
    const ts = migrationTimestamp();
    const migrationFile = `${ts}_${parseName(desc).kebab}.sql`;
    const migrationPath = resolve(dir, migrationFile);
    const relPath = `${relDir}/${migrationFile}`;

    await ensureDir(dir);

    const content = `-- Migration: ${parseName(desc).human}
-- Timestamp: ${ts}

-- Write your SQL migration here.
-- Example:
--   CREATE TABLE IF NOT EXISTS example (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     name TEXT NOT NULL,
--     created_at TEXT NOT NULL DEFAULT (datetime('now'))
--   );

`;

    const created = writeFileWithForce(
      migrationPath,
      content,
      opts.force ?? false,
    );

    if (created) {
      successSummary([relPath], `Migration "${parseName(desc).kebab}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

// ========================================================================
//  SEED
// ========================================================================

function createSeedCommand(): Command {
  const cmd = new Command("seed");
  cmd.description("Generate a SQL seed file");
  cmd.argument("<name>", "Seed name (e.g. users)");
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.action(async (name: string, opts: { force?: boolean }) => {
    const root = projectGuard();
    const info = parseName(name);
    const dir = resolve(root, "src", "database", "seeds");
    const relDir = `src/database/seeds`;
    const ts = migrationTimestamp();
    const seedFile = `${ts}_seed_${info.kebab}.sql`;
    const seedPath = resolve(dir, seedFile);
    const relPath = `${relDir}/${seedFile}`;

    await ensureDir(dir);

    const tableName = pluralKebab(info).replace(/-/g, "_");
    const content = `-- Seed: ${info.human}
-- Timestamp: ${ts}

-- Insert sample data into the \`${tableName}\` table.
-- Example:
--   INSERT INTO ${tableName} (name, email, role) VALUES
--     ('Alice', 'alice@example.com', 'admin'),
--     ('Bob', 'bob@example.com', 'user');
--
-- Clear existing data first:
--   DELETE FROM ${tableName};

`;

    const created = writeFileWithForce(seedPath, content, opts.force ?? false);

    if (created) {
      successSummary([relPath], `Seed "${info.human}" created`);
    } else {
      console.log(
        pc.yellow(
          `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
        ),
      );
    }
  });
  return cmd;
}

// ========================================================================
//  SWAGGER  (enhanced with auto-detection)
// ========================================================================

function createSwaggerCommand(): Command {
  const cmd = new Command("swagger");
  cmd.description(
    "Generate Swagger/OpenAPI configuration — auto-detects controllers and DTOs",
  );
  cmd.option("-f, --force", "Overwrite existing files");
  cmd.option(
    "--detect",
    "Scan existing controllers and DTOs to auto-add Swagger decorators",
  );
  cmd.option(
    "--update-worker",
    "Automatically update worker.ts to enable Swagger",
  );
  cmd.option("--title <title>", "API title for Swagger docs", "My API");
  cmd.option("--version <version>", "API version for Swagger docs", "1.0.0");
  cmd.option("--path <path>", "Swagger UI path", "/docs");
  cmd.option("--no-auth", "Disable Basic Auth for Swagger UI");
  cmd.action(
    async (opts: {
      force?: boolean;
      detect?: boolean;
      updateWorker?: boolean;
      title?: string;
      version?: string;
      path?: string;
      auth?: boolean;
    }) => {
      const root = projectGuard();
      const dir = ensureCommonDir(root, "config");
      const relDir = `src/common/config`;
      const swaggerFile = "swagger.ts";
      const swaggerPath = resolve(dir, swaggerFile);
      const relPath = `${relDir}/${swaggerFile}`;

      await ensureDir(dir);

      // ── Detect phase (optional) ──────────────────────────────────
      let detectedControllers: DetectedController[] = [];
      let detectedDTOs: DetectedDTO[] = [];

      if (opts.detect) {
        console.log(
          pc.bold(`\n🔍 Scanning project for Swagger documentation...\n`),
        );

        detectedControllers = scanControllers(root);
        detectedDTOs = scanDTOs(root);

        if (detectedControllers.length === 0) {
          console.log(
            `  ${pc.yellow("⚠")} No controllers found in ${pc.dim("src/modules/")}`,
          );
        } else {
          console.log(
            `  ${pc.green("✓")} Found ${detectedControllers.length} controller(s)`,
          );

          for (const ctrl of detectedControllers) {
            console.log(
              `    ${pc.dim("└─")} ${pc.cyan(ctrl.relativePath)} (${ctrl.routes.length} routes)`,
            );

            // Add @ApiTags() if missing
            if (!ctrl.hasTagsDecorator) {
              try {
                const ctrlCode = readFileSync(ctrl.filePath, "utf-8");
                const { code: updated, modified } = addApiTagsToController(
                  ctrlCode,
                  ctrl.tags,
                );
                if (modified) {
                  writeFileSync(ctrl.filePath, updated, "utf-8");
                  console.log(
                    `      ${pc.green("✓")} Added @ApiTags() decorator`,
                  );
                }
              } catch {
                console.log(`      ${pc.red("✗")} Failed to update controller`);
              }
            } else {
              console.log(`      ${pc.dim("—")} @ApiTags() already present`);
            }

            // Add @ApiOperation() for each route if missing
            for (const route of ctrl.routes) {
              if (route.hasApiOperation) continue;
              try {
                const ctrlCode = readFileSync(ctrl.filePath, "utf-8");
                const { code: updated, modified } = addApiOperationToHandler(
                  ctrlCode,
                  route.handlerName,
                  route,
                );
                if (modified) {
                  writeFileSync(ctrl.filePath, updated, "utf-8");
                  console.log(
                    `      ${pc.green("✓")} Added @ApiOperation() to ${pc.dim(route.handlerName)}`,
                  );
                }
              } catch {
                console.log(
                  `      ${pc.red("✗")} Failed to add @ApiOperation() to ${route.handlerName}`,
                );
              }
            }
          }
        }

        if (detectedDTOs.length === 0) {
          console.log(
            `  ${pc.yellow("⚠")} No DTOs found in ${pc.dim("src/modules/")}`,
          );
        } else {
          console.log(`  ${pc.green("✓")} Found ${detectedDTOs.length} DTO(s)`);

          for (const dto of detectedDTOs) {
            console.log(
              `    ${pc.dim("└─")} ${pc.cyan(dto.relativePath)} (${dto.properties.length} properties)`,
            );

            try {
              let dtoCode = readFileSync(dto.filePath, "utf-8");
              let modified = false;

              // Add @ApiModel() if missing
              if (!dto.hasApiModel) {
                const modelResult = addApiModelToDTO(
                  dtoCode,
                  dto.className,
                  dto.properties,
                );
                if (modelResult.modified) {
                  dtoCode = modelResult.code;
                  modified = true;
                }
              }

              // Add @Prop() to properties if missing
              const propResult = addPropToDTOProperties(
                dtoCode,
                dto.properties,
              );
              if (propResult.modified) {
                dtoCode = propResult.code;
                modified = true;
              }

              if (modified) {
                writeFileSync(dto.filePath, dtoCode, "utf-8");
                console.log(`      ${pc.green("✓")} Added Swagger decorators`);
              } else {
                console.log(
                  `      ${pc.dim("—")} All decorators already present`,
                );
              }
            } catch {
              console.log(`      ${pc.red("✗")} Failed to update DTO`);
            }
          }
        }

        console.log(pc.green(`\n✅ Detection complete!\n`));
      }

      // ── Generate Swagger config ──────────────────────────────────
      const authBlock =
        opts.auth !== false
          ? `  auth: {
    username: "admin",
    password: process.env.SWAGGER_PASSWORD || "swagger-secret",
  },
`
          : "";

      // Build server URL suggestion from project name
      let suggestedUrl = "https://api.example.com";
      try {
        const pkgPath = resolve(root, "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          const projectName = pkg.name || "";
          if (projectName) {
            suggestedUrl = `https://${projectName.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9-]/g, "")}.workers.dev`;
          }
        }
      } catch {
        // fallback
      }

      const swaggerContent = `import type { SwaggerOptions } from "@varbyte/nest-worker";

/**
 * Swagger/OpenAPI configuration.
 *
 * Generated by \`nest-worker generate swagger\`.
 * Customize this config and pass it to \`app.useSwagger()\` in your worker.
 *
 * @example
 * \`\`\`ts
 * import { swaggerConfig } from "./common/config/swagger";
 * app.useSwagger(swaggerConfig);
 * \`\`\`
 */
export const swaggerConfig: SwaggerOptions = {
  title: process.env.APP_NAME || "${opts.title || "My API"}",
  version: "${opts.version || "1.0.0"}",
  description: "API documentation generated with @varbyte/nest-worker",
  path: "${opts.path || "/docs"}",
${authBlock}  servers: [
    {
      url: process.env.API_URL || "${suggestedUrl}",
      description: "API server",
    },
  ],
};
`;

      const created = writeFileWithForce(
        swaggerPath,
        swaggerContent,
        opts.force ?? false,
      );

      if (created) {
        successSummary([relPath], `Swagger config created`);
      } else {
        console.log(
          pc.yellow(
            `\n  ⚠  ${relPath} already exists (use --force to overwrite)\n`,
          ),
        );
      }

      // ── Update worker.ts (optional) ───────────────────────────────
      if (opts.updateWorker) {
        const workerPath = resolve(root, "src", "worker.ts");
        if (!existsSync(workerPath)) {
          console.log(
            pc.yellow(
              `\n  ⚠  src/worker.ts not found — cannot enable Swagger\n`,
            ),
          );
        } else {
          let workerCode = readFileSync(workerPath, "utf-8");
          let workerModified = false;

          // Add swagger import if not present
          if (!workerCode.includes("./common/config/swagger")) {
            const importLine = `import { swaggerConfig } from './common/config/swagger';`;
            const lines = workerCode.split("\n");
            let lastImportIdx = -1;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith("import ")) lastImportIdx = i;
            }
            if (lastImportIdx >= 0) {
              lines.splice(lastImportIdx + 1, 0, importLine);
              workerCode = lines.join("\n");
              workerModified = true;
            }
          }

          // Add useSwagger if not present
          if (!workerCode.includes("useSwagger")) {
            workerCode = workerCode.replace(
              /(app\s*\.\s*(?:use|useErrorFilter))/,
              `app.useSwagger(swaggerConfig);\n$1`,
            );
            workerModified = true;
          }

          if (workerModified) {
            writeFileSync(workerPath, workerCode, "utf-8");
            console.log(
              pc.green(
                `  ✓ Updated ${pc.dim("src/worker.ts")} with Swagger setup`,
              ),
            );
          } else {
            console.log(
              pc.dim(`  — Swagger already configured in src/worker.ts`),
            );
          }
        }
      }

      // Show usage hints
      if (opts.detect || opts.updateWorker) {
        console.log(pc.bold(`\n📋 Next steps:\n`));
        if (opts.updateWorker) {
          console.log(
            `  ${pc.dim("1.")} Start your dev server: ${pc.cyan("npm run dev")}`,
          );
          console.log(
            `  ${pc.dim("2.")} Open ${pc.cyan(`${opts.path || "/docs"}`)} in your browser`,
          );
        } else {
          console.log(
            `  ${pc.dim("1.")} Use swagger in worker.ts:\n     ${pc.cyan(
              `import { swaggerConfig } from "./common/config/swagger";`,
            )}`,
          );
          console.log(`     ${pc.cyan(`app.useSwagger(swaggerConfig);`)}`);
        }
        console.log(
          `  ${pc.dim("2.")} Run ${pc.cyan("nest-worker generate swagger --detect")} to update decorators`,
        );
        console.log(``);
      }
    },
  );
  return cmd;
}

function createEnvCommand(): Command {
  const cmd = new Command("env");
  cmd.description(
    "Add an environment variable (updates wrangler.toml or prints instructions)",
  );
  cmd.argument("<var>", "Environment variable name (e.g. API_SECRET)");
  cmd.option("-v, --value <value>", "Default / placeholder value");
  cmd.option(
    "-t, --type <type>",
    "Binding type: secret | text | json",
    "secret",
  );
  cmd.option("-f, --force", "Overwrite existing variable in wrangler.toml");
  cmd.action(
    (
      varName: string,
      opts: { value?: string; type: string; force?: boolean },
    ) => {
      const root = projectGuard();
      const wranglerPath = resolve(root, "wrangler.toml");
      const value = opts.value ?? "<your-" + varName.toLowerCase() + ">";
      const type = opts.type;

      if (!existsSync(wranglerPath)) {
        console.log(pc.yellow(`\n  ⚠  wrangler.toml not found.`));
        console.log(
          pc.dim(`\n  Add the following to your \`wrangler.toml\`:\n`),
        );
        if (type === "secret") {
          console.log(`  [vars]\n  ${varName} = "${value}"\n`);
        } else {
          console.log(`  [vars]\n  ${varName} = ${value}\n`);
        }
        return;
      }

      let content = readFileSync(wranglerPath, "utf-8");

      // Check if already defined
      const varRegex = new RegExp(`^${escapeRegex(varName)}\\s*=`, "m");
      if (varRegex.test(content)) {
        if (!opts.force) {
          console.log(
            pc.yellow(
              `\n  ⚠  \`${varName}\` already exists in wrangler.toml (use --force to overwrite)\n`,
            ),
          );
          return;
        }
        // Replace existing line
        content = content.replace(varRegex, `${varName} = "${value}"`);
        writeFileSync(wranglerPath, content, "utf-8");
        console.log(
          pc.green(`\n  ✓ Updated \`${varName}\` in wrangler.toml\n`),
        );
        return;
      }

      // Ensure [vars] section exists
      if (/^\[vars\]/m.test(content)) {
        // Append after the [vars] section
        content = content.replace(
          /^\[vars\]\s*\n/m,
          `[vars]\n${varName} = "${value}"\n`,
        );
      } else {
        // Add [vars] section at the end
        content += `\n[vars]\n${varName} = "${value}"\n`;
      }

      writeFileSync(wranglerPath, content, "utf-8");
      console.log(pc.green(`\n  ✓ Added \`${varName}\` to wrangler.toml\n`));

      if (type === "secret") {
        console.log(pc.dim(`  💡 If this is a secret, also run:\n`));
        console.log(
          pc.dim(
            `     ${pc.cyan(`echo "${value}" | wrangler secret put ${varName}`)}\n`,
          ),
        );
      }
    },
  );
  return cmd;
}

// ========================================================================
//  GENERATE command (parent)
// ========================================================================

export function generateCommand(): Command {
  const cmd = new Command("generate");
  cmd.description("Generate nest-worker components");
  cmd.helpOption("-h, --help", "Show generate help");

  cmd.addCommand(createModuleCommand());
  cmd.addCommand(createControllerCommand());
  cmd.addCommand(createServiceCommand());
  cmd.addCommand(createResourceCommand());
  cmd.addCommand(createGuardCommand());
  cmd.addCommand(createMiddlewareCommand());
  cmd.addCommand(createExceptionCommand());
  cmd.addCommand(createFilterCommand());
  cmd.addCommand(createRepositoryCommand());
  cmd.addCommand(createModelCommand());
  cmd.addCommand(createDtoCommand());
  cmd.addCommand(createProviderCommand());
  cmd.addCommand(createSwaggerCommand());
  cmd.addCommand(createMigrationCommand());
  cmd.addCommand(createSeedCommand());
  cmd.addCommand(createEnvCommand());

  // Default: show help if no subcommand
  cmd.action(() => cmd.help());

  return cmd;
}

// ========================================================================
//  Migration template helper (used by resource generator)
// ========================================================================

function buildMigrationTemplate(info: NameInfo): string {
  const tableName = pluralKebab(info).replace(/-/g, "_");
  const ts = migrationTimestamp();

  return `-- Migration: create_${tableName}
-- Description: Creates the ${tableName} table
-- Timestamp: ${ts}

CREATE TABLE IF NOT EXISTS ${tableName} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- TODO: add your columns here
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName}(created_at);
`;
}
