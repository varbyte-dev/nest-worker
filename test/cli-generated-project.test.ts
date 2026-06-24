import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    await pointGeneratedProjectAtLocalWorkspace(projectRoot);

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
}

async function linkPackage(projectRoot: string, packageName: string) {
  const packageRoot = resolve(repoRoot, "node_modules", packageName);
  const target = resolve(projectRoot, "node_modules", packageName);

  await mkdir(dirname(target), { recursive: true });
  await symlink(packageRoot, target, "dir");
}
