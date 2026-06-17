import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { detectProject, findProjectRoot } from '../utils/project.js';

interface ResourceEntry {
  name: string;
  type: 'module' | 'middleware' | 'guard' | 'exception' | 'filter';
  items: string[];
}

function scanModules(dir: string): ResourceEntry[] {
  const modulesDir = resolve(dir, 'src', 'modules');
  if (!existsSync(modulesDir)) return [];

  const entries = readdirSync(modulesDir, { withFileTypes: true });
  const modules: ResourceEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const modulePath = resolve(modulesDir, entry.name);
    const files = readdirSync(modulePath).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'),
    );

    if (files.length > 0) {
      modules.push({
        name: entry.name,
        type: 'module',
        items: files,
      });
    }
  }

  return modules;
}

function scanCommon(dir: string): ResourceEntry[] {
  const commonDir = resolve(dir, 'src', 'common');
  if (!existsSync(commonDir)) return [];

  const subdirs = ['middlewares', 'guards', 'exceptions', 'filters'];
  const resources: ResourceEntry[] = [];

  for (const subdir of subdirs) {
    const fullPath = resolve(commonDir, subdir);
    if (!existsSync(fullPath)) continue;

    const files = readdirSync(fullPath).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'),
    );

    if (files.length > 0) {
      resources.push({
        name: subdir,
        type: subdir === 'middlewares'
          ? 'middleware'
          : subdir === 'guards'
            ? 'guard'
            : subdir === 'exceptions'
              ? 'exception'
              : 'filter',
        items: files,
      });
    }
  }

  return resources;
}

const typeColors: Record<ResourceEntry['type'], (s: string) => string> = {
  module: pc.cyan,
  middleware: pc.magenta,
  guard: pc.yellow,
  exception: pc.red,
  filter: pc.blue,
};

const typeLabels: Record<ResourceEntry['type'], string> = {
  module: 'module',
  middleware: 'middleware',
  guard: 'guard',
  exception: 'exception',
  filter: 'filter',
};

function printTree(
  resources: ResourceEntry[],
  label: string,
  dirName: string,
): void {
  if (resources.length === 0) {
    console.log(`  ${pc.dim('(none)')}\n`);
    return;
  }

  for (const [i, res] of resources.entries()) {
    const isLast = i === resources.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';
    const color = typeColors[res.type];
    const typeLabel = typeLabels[res.type];

    console.log(
      `${prefix} ${color(pc.bold(res.name))} ${pc.dim(`(${typeLabel})`)}`,
    );

    for (const [j, file] of res.items.entries()) {
      const isFileLast = j === res.items.length - 1;
      const filePrefix = isLast
        ? '     '
        : '  │  ';
      const branch = isFileLast ? '└─' : '├─';
      console.log(`  ${filePrefix}${pc.dim(branch)} ${pc.dim(file)}`);
    }

    if (!isLast) {
      // spacer between entries for readability
      console.log(`  │`);
    }
  }
}

export function listCommand(): Command {
  const cmd = new Command('list');
  cmd.description('List all generated modules, controllers, services in the project');
  cmd.action(() => {
    const projectRoot = findProjectRoot();
    const project = detectProject(projectRoot);

    if (!project.hasNestWorker) {
      console.log(
        pc.red('\n  ✗ This is not a @varbyte/nest-worker project.\n'),
      );
      console.log(
        pc.dim(
          `  Run ${pc.cyan('nest-worker new <name>')} to create one, or ensure you are in the correct directory.\n`,
        ),
      );
      return;
    }

    console.log(pc.bold('\n📦 Generated Resources\n'));

    const modules = scanModules(projectRoot);
    const common = scanCommon(projectRoot);

    if (modules.length === 0 && common.length === 0) {
      console.log(`  ${pc.dim('No generated resources found.')}\n`);
      console.log(
        pc.dim(
          `  Run ${pc.cyan('nest-worker generate module <name>')} to create your first module.\n`,
        ),
      );
      return;
    }

    if (modules.length > 0) {
      console.log(`  ${pc.bold('src/modules/')}`);
      printTree(modules, 'Modules', 'src/modules');
      console.log('');
    }

    if (common.length > 0) {
      console.log(`  ${pc.bold('src/common/')}`);
      printTree(common, 'Shared', 'src/common');
      console.log('');
    }
  });
  return cmd;
}
