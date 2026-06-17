import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { detectProject, findProjectRoot } from '../utils/project.js';

function getCliVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(__dirname, '..', '..', 'package.json');
  if (existsSync(pkgPath)) {
    try {
      return JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.0.0';
    } catch {
      // fall through
    }
  }
  return '0.0.0';
}

function getFrameworkVersion(projectRoot: string): string | null {
  const fwPkgPath = resolve(
    projectRoot,
    'node_modules',
    '@varbyte',
    'nest-worker',
    'package.json',
  );
  if (existsSync(fwPkgPath)) {
    try {
      return JSON.parse(readFileSync(fwPkgPath, 'utf-8')).version || null;
    } catch {
      // fall through
    }
  }
  return null;
}

export function infoCommand(): Command {
  const cmd = new Command('info');
  cmd.description('Display framework and project information');
  cmd.action(() => {
    console.log(pc.bold('\n📋 nest-worker Information\n'));

    const cliVersion = getCliVersion();
    console.log(`  ${pc.dim('CLI Version:')}     ${pc.green(cliVersion)}`);

    const projectRoot = findProjectRoot();
    const project = detectProject(projectRoot);

    let fwVersion: string;
    if (project.hasNestWorker) {
      const raw = getFrameworkVersion(projectRoot);
      fwVersion = raw !== null ? pc.green(raw) : pc.yellow('unknown');
    } else {
      fwVersion = pc.red('not installed');
    }
    console.log(`  ${pc.dim('Framework:')}       ${fwVersion}`);
    console.log(`  ${pc.dim('Node.js:')}        ${pc.cyan(process.version)}`);
    console.log(`  ${pc.dim('Platform:')}       ${pc.cyan(process.platform)}`);
    console.log(
      `  ${pc.dim('Project Root:')}    ${pc.white(project.root)}`,
    );
    console.log(
      `  ${pc.dim('Package:')}         ${pc.white(project.packageName || pc.dim('—'))}`,
    );

    console.log('');
    console.log(`  ${pc.bold('Project Structure')}`);
    console.log(
      `  ${pc.dim('├─')} package.json     ${project.hasPackageJson ? pc.green('✓') : pc.red('✗')}`,
    );
    console.log(
      `  ${pc.dim('├─')} tsconfig.json    ${project.hasTsConfig ? pc.green('✓') : pc.red('✗')}`,
    );
    console.log(
      `  ${pc.dim('├─')} wrangler.toml    ${project.hasWrangler ? pc.green('✓') : pc.red('✗')}`,
    );
    console.log(
      `  ${pc.dim('└─')} src/worker.ts    ${project.hasWorkerEntry ? pc.green('✓') : pc.red('✗')}`,
    );

    console.log(
      pc.dim(
        `\n  💡 Run ${pc.cyan('nest-worker doctor')} for detailed configuration checks.\n`,
      ),
    );
  });
  return cmd;
}
