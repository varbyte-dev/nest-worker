import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ProjectInfo {
  /** Root path of the project */
  root: string;
  /** Has package.json */
  hasPackageJson: boolean;
  /** Has tsconfig.json */
  hasTsConfig: boolean;
  /** Has wrangler.toml */
  hasWrangler: boolean;
  /** Has src/worker.ts entry point */
  hasWorkerEntry: boolean;
  /** Has @varbyte/nest-worker in dependencies */
  hasNestWorker: boolean;
  /** Package name from package.json */
  packageName: string | null;
}

export function detectProject(dir: string): ProjectInfo {
  const pkgPath = resolve(dir, 'package.json');
  const hasPackageJson = existsSync(pkgPath);

  let packageName: string | null = null;
  let hasNestWorker = false;

  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      packageName = pkg.name || null;
      hasNestWorker =
        (pkg.dependencies && pkg.dependencies['@varbyte/nest-worker']) ||
        (pkg.devDependencies && pkg.devDependencies['@varbyte/nest-worker'])
        ? true
        : false;
    } catch {
      // ignore parse errors
    }
  }

  return {
    root: dir,
    hasPackageJson,
    hasTsConfig: existsSync(resolve(dir, 'tsconfig.json')),
    hasWrangler: existsSync(resolve(dir, 'wrangler.toml')),
    hasWorkerEntry: existsSync(resolve(dir, 'src', 'worker.ts')),
    hasNestWorker,
    packageName,
  };
}

/**
 * Resolve the project root by walking up from cwd until we find
 * a package.json with @varbyte/nest-worker dependency, or just the cwd.
 */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir || process.cwd();
  // Walk up at most 10 levels
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'package.json'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return startDir || process.cwd();
}
