import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../cli/src/commands/doctor.command";
import { generateCommand } from "../cli/src/commands/generate/generate.command";
import { infoCommand } from "../cli/src/commands/info.command";
import { listCommand } from "../cli/src/commands/list.command";
import { newCommand } from "../cli/src/commands/new.command";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { force: true, recursive: true });
  }
});

describe("CLI generated project", () => {
  it("should scaffold a project that typechecks against the local package", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "nest-worker-cli-"));
    createdDirs.push(tempRoot);

    await runNewCommand(tempRoot, "sample-api");

    const projectRoot = resolve(tempRoot, "sample-api");

    expect(existsSync(resolve(projectRoot, "package.json"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "tsconfig.json"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "wrangler.toml"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "src/worker.ts"))).toBe(true);
    expect(
      existsSync(resolve(projectRoot, "src/common/filters/app-error.filter.ts")),
    ).toBe(true);

    await pointGeneratedProjectAtLocalWorkspace(projectRoot);

    typecheckGeneratedProject(projectRoot);
  });

  it("should generate runtime-aligned resource and filter files that typecheck", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "nest-worker-cli-"));
    createdDirs.push(tempRoot);

    await runNewCommand(tempRoot, "sample-api");

    const projectRoot = resolve(tempRoot, "sample-api");
    await pointGeneratedProjectAtLocalWorkspace(projectRoot);

    await runGenerateCommand(projectRoot, ["resource", "user"]);
    await runGenerateCommand(projectRoot, ["filter", "domain-error"]);

    const controller = await readFile(
      resolve(projectRoot, "src/modules/user/user.controller.ts"),
      "utf-8",
    );
    const filter = await readFile(
      resolve(projectRoot, "src/common/filters/domain-error.filter.ts"),
      "utf-8",
    );

    expect(controller).toContain("validateBody");
    expect(controller).toContain("@UsePipe(validateCreateUser)");
    expect(filter).toContain("ErrorFilterFn");
    expect(filter).toContain("app.useErrorFilter(domainErrorFilter)");

    typecheckGeneratedProject(projectRoot);
  });

  it("should generate every CLI artifact and keep the generated project type-safe", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "nest-worker-cli-"));
    createdDirs.push(tempRoot);

    await runNewCommand(tempRoot, "sample-api");

    const projectRoot = resolve(tempRoot, "sample-api");
    await pointGeneratedProjectAtLocalWorkspace(projectRoot);

    await runGenerateCommand(projectRoot, ["module", "billing"]);
    await runGenerateCommand(projectRoot, ["model", "customer"]);
    await runGenerateCommand(projectRoot, ["repository", "customer"]);
    await runGenerateCommand(projectRoot, ["service", "customer"]);
    await runGenerateCommand(projectRoot, ["controller", "customer"]);
    await runGenerateCommand(projectRoot, ["dto", "customer"]);
    await runGenerateCommand(projectRoot, ["guard", "admin"]);
    await runGenerateCommand(projectRoot, ["middleware", "audit"]);
    await runGenerateCommand(projectRoot, [
      "exception",
      "payment-required",
      "--status",
      "402",
    ]);
    await runGenerateCommand(projectRoot, ["filter", "domain-error"]);
    await runGenerateCommand(projectRoot, ["provider", "settings"]);
    await runGenerateCommand(projectRoot, [
      "provider",
      "feature-flags",
      "--type",
      "value",
    ]);
    await runGenerateCommand(projectRoot, [
      "provider",
      "cache",
      "--type",
      "class",
    ]);
    await runGenerateCommand(projectRoot, ["migration", "add-customer-status"]);
    await runGenerateCommand(projectRoot, ["seed", "customers"]);
    await runGenerateCommand(projectRoot, [
      "env",
      "API_SECRET",
      "--value",
      "local-secret",
      "--force",
    ]);

    const expectedFiles = [
      "src/modules/billing/billing.module.ts",
      "src/modules/customer/customer.model.ts",
      "src/modules/customer/customer.repository.ts",
      "src/modules/customer/customer.service.ts",
      "src/modules/customer/customer.controller.ts",
      "src/modules/customer/dto/create-customer.dto.ts",
      "src/modules/customer/dto/update-customer.dto.ts",
      "src/common/guards/admin.guard.ts",
      "src/common/middlewares/audit.middleware.ts",
      "src/common/exceptions/payment-required.exception.ts",
      "src/common/filters/domain-error.filter.ts",
      "src/config/providers/settings.provider.ts",
      "src/config/providers/feature-flags.provider.ts",
      "src/config/providers/cache.provider.ts",
    ];

    for (const file of expectedFiles) {
      expect(existsSync(resolve(projectRoot, file)), file).toBe(true);
    }

    const migrationFiles = await readdir(
      resolve(projectRoot, "src/database/migrations"),
    );
    const seedFiles = await readdir(resolve(projectRoot, "src/database/seeds"));
    expect(
      migrationFiles.some((file) => file.endsWith("_add-customer-status.sql")),
    ).toBe(true);
    expect(seedFiles.some((file) => file.endsWith("_seed_customers.sql"))).toBe(
      true,
    );

    const wrangler = await readFile(
      resolve(projectRoot, "wrangler.toml"),
      "utf-8",
    );
    const classProvider = await readFile(
      resolve(projectRoot, "src/config/providers/cache.provider.ts"),
      "utf-8",
    );
    const exception = await readFile(
      resolve(projectRoot, "src/common/exceptions/payment-required.exception.ts"),
      "utf-8",
    );

    expect(wrangler).toContain('API_SECRET = "local-secret"');
    expect(classProvider).toContain("useClass: CacheProviderClass");
    expect(exception).toContain("super(message, 402, details)");

    await runCliCommand(projectRoot, listCommand());
    await runCliCommand(projectRoot, infoCommand());
    await runCliCommand(projectRoot, doctorCommand());

    typecheckGeneratedProject(projectRoot);
  });
});

function typecheckGeneratedProject(projectRoot: string) {
  try {
    execFileSync(
      "pnpm",
      ["exec", "tsc", "--noEmit", "-p", resolve(projectRoot, "tsconfig.json")],
      {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
  } catch (error) {
    const result = error as { stderr?: string; stdout?: string };
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
}

async function runNewCommand(cwd: string, name: string) {
  const command = newCommand();
  command.exitOverride();

  const previousCwd = process.cwd();
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

  try {
    process.chdir(cwd);
    await command.parseAsync(["node", "test", name, "--no-git"]);
  } finally {
    process.chdir(previousCwd);
    consoleLog.mockRestore();
  }
}

async function runGenerateCommand(cwd: string, args: string[]) {
  await runCliCommand(cwd, generateCommand(), args);
}

async function runCliCommand(
  cwd: string,
  command: ReturnType<typeof generateCommand>,
  args: string[] = [],
) {
  command.exitOverride();

  const previousCwd = process.cwd();
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  try {
    process.chdir(cwd);
    await command.parseAsync(["node", "test", ...args]);
  } finally {
    process.chdir(previousCwd);
    consoleLog.mockRestore();
    consoleError.mockRestore();
  }
}

async function pointGeneratedProjectAtLocalWorkspace(projectRoot: string) {
  const tsconfigPath = resolve(projectRoot, "tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf-8"));

  tsconfig.compilerOptions.baseUrl = ".";
  delete tsconfig.compilerOptions.rootDir;
  tsconfig.compilerOptions.paths = {
    "@varbyte/nest-worker": [
      relative(projectRoot, resolve(repoRoot, "src/index.ts")),
    ],
  };

  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
  await linkPackage(projectRoot, "reflect-metadata");
  await linkPackage(projectRoot, "@cloudflare/workers-types");
  await linkPackage(projectRoot, "@varbyte/nest-worker");
}

async function linkPackage(projectRoot: string, packageName: string) {
  const packageRoot = resolve(repoRoot, "node_modules", packageName);
  const target = resolve(projectRoot, "node_modules", packageName);

  await mkdir(dirname(target), { recursive: true });
  await symlink(packageRoot, target, "dir");
}
