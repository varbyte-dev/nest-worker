import { Command } from "commander";
import pc from "picocolors";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { parseName } from "../utils/naming.js";
import { ensureDir, createFile } from "../utils/file-system.js";

export function newCommand(): Command {
  const cmd = new Command("new");
  cmd
    .description(
      "Scaffold a new Cloudflare Worker project using @varbyte/nest-worker",
    )
    .argument("<name>", "Project name")
    .option("--no-git", "Skip git initialization")
    .action(async (name: string, options: { git?: boolean }) => {
      const targetDir = resolve(process.cwd(), name);

      // Check if directory already exists
      if (existsSync(targetDir)) {
        console.log(pc.red(`✗ Directory "${name}" already exists`));
        process.exit(1);
      }

      const n = parseName(name);

      console.log(
        pc.bold(
          `\n🚀 Creating new nest-worker project: ${pc.green(n.kebab)}\n`,
        ),
      );

      // Create directory structure
      const dirs = [
        `${targetDir}/src/modules/app`,
        `${targetDir}/src/modules/health`,
        `${targetDir}/src/common/middlewares`,
        `${targetDir}/src/common/exceptions`,
        `${targetDir}/src/config`,
        `${targetDir}/src/database/migrations`,
      ];
      for (const d of dirs) await ensureDir(d);

      // Create files using the template contents
      const files: Array<[string, string]> = [
        ["package.json", packageJson(n)],
        ["tsconfig.json", tsconfigJson()],
        ["wrangler.toml", wranglerToml(n)],
        [".gitignore", gitignore()],
        ["src/worker.ts", workerTs()],
        ["src/modules/app/app.module.ts", appModuleTs()],
        ["src/modules/app/app.controller.ts", appControllerTs()],
        ["src/modules/app/app.service.ts", appServiceTs()],
        ["src/modules/health/health.controller.ts", healthControllerTs()],
        ["src/common/filters/app-error.filter.ts", appErrorFilterTs()],
        ["src/common/exceptions/app.exception.ts", appExceptionTs()],
        ["src/config/app.config.ts", appConfigTs()],
        ["src/database/migrations/.gitkeep", ""],
      ];

      for (const [filePath, content] of files) {
        const fullPath = resolve(targetDir, filePath);
        await createFile(fullPath, content);
        console.log(`  ${pc.green("✓")} ${pc.dim(filePath)}`);
      }

      // Git initialization
      if (options.git !== false) {
        try {
          execSync("git init", { cwd: targetDir, stdio: "ignore" });
          console.log(`  ${pc.green("✓")} ${pc.dim(".git/")}`);
        } catch {
          console.log(
            `  ${pc.yellow("⚠")} ${pc.dim("Could not initialize git repository")}`,
          );
        }
      }

      console.log(
        pc.green(`\n✅ Project "${n.kebab}" created successfully!\n`),
      );
      console.log(pc.cyan("  Next steps:"));
      console.log(`    ${pc.dim("1.")} cd ${n.kebab}`);
      console.log(`    ${pc.dim("2.")} npm install`);
      console.log(`    ${pc.dim("3.")} npm run dev`);
      console.log("");
    });
  return cmd;
}

// ─── Template Functions ──────────────────────────────────────────────────

function packageJson(n: ReturnType<typeof parseName>): string {
  return JSON.stringify(
    {
      name: n.kebab,
      version: "0.1.0",
      description: "Cloudflare Worker built with @varbyte/nest-worker",
      type: "module",
      scripts: {
        dev: "wrangler dev",
        deploy: "wrangler deploy",
        typecheck: "tsc --noEmit",
        "db:migrate": `wrangler d1 migrations apply ${n.kebab}-db`,
        "db:seed": `wrangler d1 execute ${n.kebab}-db --file=./src/database/seed.sql`,
      },
      dependencies: {
        "@varbyte/nest-worker": "latest",
        "reflect-metadata": "^0.2.2",
      },
      devDependencies: {
        typescript: "^5.3.3",
        wrangler: "^3.40.0",
        "@cloudflare/workers-types": "^4.20241205.0",
      },
    },
    null,
    2,
  );
}

function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ES2022"],
        types: ["@cloudflare/workers-types"],
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist",
        rootDir: "src",
        declaration: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2,
  );
}

function wranglerToml(n: ReturnType<typeof parseName>): string {
  return `name = "${n.kebab}"
main = "src/worker.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database binding (uncomment and configure for D1 usage)
# [[d1_databases]]
# binding = "DB"
# database_name = "${n.kebab}-db"
# database_id = "YOUR_DATABASE_ID"

[dev]
port = 8787
local_protocol = "http"
`;
}

function gitignore(): string {
  return `node_modules
dist
.wrangler
*.log
.DS_Store
`;
}

function workerTs(): string {
  return `import 'reflect-metadata';
import { createApplication, cors, requestLogger } from '@varbyte/nest-worker';
import { appErrorFilter } from './common/filters/app-error.filter';
import { AppModule } from './modules/app/app.module';

const app = createApplication(AppModule);
app.use(requestLogger({ json: true }));
app.use(cors());
app.useErrorFilter(appErrorFilter);

export default app.handler;
`;
}

function appModuleTs(): string {
  return `import { Module } from '@varbyte/nest-worker';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
}

function appControllerTs(): string {
  return `import { Controller, Get } from '@varbyte/nest-worker';
import { AppService } from './app.service';

@Controller('', [AppService])
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
`;
}

function appServiceTs(): string {
  return `import { Injectable } from '@varbyte/nest-worker';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello from nest-worker!';
  }
}
`;
}

function healthControllerTs(): string {
  return `import { Controller, Get } from '@varbyte/nest-worker';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
`;
}

function appErrorFilterTs(): string {
  return `import type { ErrorFilterFn } from '@varbyte/nest-worker';
import { HttpException } from '@varbyte/nest-worker';

export const appErrorFilter: ErrorFilterFn = (error, { request }) => {
  if (!(error instanceof HttpException)) return;

  return Response.json({
    ...error.toJSON(),
    path: new URL(request.url).pathname,
    timestamp: new Date().toISOString(),
  }, { status: error.statusCode });
}
`;
}

function appExceptionTs(): string {
  return `import { HttpException } from '@varbyte/nest-worker';

export class AppException extends HttpException {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, details);
    this.name = 'AppException';
  }
}
`;
}

function appConfigTs(): string {
  return `import type { InjectionToken } from '@varbyte/nest-worker';

export interface AppConfig {
  appName: string;
  version: string;
  environment: string;
  port: number;
}

export const APP_CONFIG: InjectionToken = 'APP_CONFIG';

export const appConfigProvider = {
  provide: APP_CONFIG,
  useValue: {
    appName: 'nest-worker-app',
    version: '0.1.0',
    environment: 'development',
    port: 8787,
  } satisfies AppConfig,
};
`;
}
