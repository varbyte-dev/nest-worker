import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { detectProject, findProjectRoot } from '../utils/project.js';

interface Diagnostic {
  pass: boolean;
  message: string;
  fix?: string;
}

function checkDependencies(root: string): Diagnostic {
  const pkgPath = resolve(root, 'package.json');
  if (!existsSync(pkgPath)) {
    return {
      pass: false,
      message: 'package.json not found',
      fix: 'Run `nest-worker new <name>` to scaffold a new project.',
    };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (!deps['@varbyte/nest-worker']) {
      return {
        pass: false,
        message: '@varbyte/nest-worker is not installed',
        fix: 'Run `npm install @varbyte/nest-worker` (or your package manager equivalent).',
      };
    }

    const requiredDeps = ['@varbyte/nest-worker'];
    const missing = requiredDeps.filter((dep) => !deps[dep]);

    if (missing.length === 0) {
      return { pass: true, message: 'All required dependencies are installed.' };
    }

    return {
      pass: false,
      message: `Missing dependencies: ${missing.join(', ')}`,
      fix: `Run \`npm install ${missing.join(' ')}\` (or your package manager equivalent).`,
    };
  } catch {
    return {
      pass: false,
      message: 'package.json is malformed',
      fix: 'Check the syntax of your package.json file.',
    };
  }
}

function checkTsConfig(root: string): Diagnostic[] {
  const tsconfigPath = resolve(root, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    return [
      {
        pass: false,
        message: 'tsconfig.json not found',
        fix: 'Create a tsconfig.json with TypeScript compiler options.',
      },
    ];
  }

  const results: Diagnostic[] = [];

  try {
    const config = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    const compilerOptions = config.compilerOptions || {};

    const checks: [string, string, string?][] = [
      [
        'experimentalDecorators',
        'experimentalDecorators is enabled',
        'experimentalDecorators is not enabled',
      ],
      [
        'emitDecoratorMetadata',
        'emitDecoratorMetadata is enabled',
        'emitDecoratorMetadata is not enabled',
      ],
    ];

    for (const [key, passMsg, failMsg] of checks) {
      if (compilerOptions[key] === true) {
        results.push({ pass: true, message: `${key}: ${passMsg}` });
      } else {
        results.push({
          pass: false,
          message: `${key}: ${failMsg}`,
          fix: `Add \`"${key}": true\` to compilerOptions in tsconfig.json.`,
        });
      }
    }

    // Check that target is at least ES2021
    const target = (compilerOptions.target || '').toUpperCase();
    const validTargets = ['ES2021', 'ES2022', 'ESNEXT'];
    if (validTargets.includes(target)) {
      results.push({
        pass: true,
        message: `TypeScript target "${compilerOptions.target}" is modern enough.`,
      });
    } else if (target) {
      results.push({
        pass: false,
        message: `TypeScript target "${compilerOptions.target}" may be too old`,
        fix: 'Set `"target": "ES2022"` in compilerOptions of tsconfig.json.',
      });
    } else {
      results.push({
        pass: true,
        message: 'TypeScript target is not explicitly set (defaults are fine).',
      });
    }
  } catch {
    results.push({
      pass: false,
      message: 'tsconfig.json is malformed',
      fix: 'Check the syntax of your tsconfig.json file.',
    });
  }

  return results;
}

function checkWrangler(root: string): Diagnostic[] {
  const wranglerPath = resolve(root, 'wrangler.toml');
  if (!existsSync(wranglerPath)) {
    return [
      {
        pass: false,
        message: 'wrangler.toml not found',
        fix: 'Create a wrangler.toml configuration file for Cloudflare Workers deployment.',
      },
    ];
  }

  const results: Diagnostic[] = [];
  const content = stripTomlComments(readFileSync(wranglerPath, 'utf-8'));

  // Check for D1 bindings
  const hasD1Binding = /\[\[d1_databases\]\]/.test(content);
  if (hasD1Binding) {
    results.push({
      pass: true,
      message: 'D1 database bindings are configured.',
    });

    // Check binding has required fields
    const bindingNameMatch = content.match(/binding\s*=\s*"([^"]+)"/);
    if (bindingNameMatch) {
      results.push({
        pass: true,
        message: `D1 binding name: "${bindingNameMatch[1]}"`,
      });
    } else {
      results.push({
        pass: false,
        message: 'D1 binding missing a binding name',
        fix: 'Add `binding = "DB"` inside your [[d1_databases]] block.',
      });
    }
  } else {
    results.push({
      pass: true,
      message: 'No D1 bindings required (skipped).',
    });
  }

  // Check for compatibility flags
  if (/compatibility_flags\s*=/.test(content)) {
    results.push({
      pass: true,
      message: 'compatibility_flags is set.',
    });
  } else {
    results.push({
      pass: false,
      message: 'compatibility_flags not set in wrangler.toml',
      fix: 'Add `compatibility_flags = ["nodejs_compat"]` to wrangler.toml.',
    });
  }

  // Check compatibility_date
  if (/compatibility_date\s*=/.test(content)) {
    results.push({
      pass: true,
      message: 'compatibility_date is set.',
    });
  } else {
    results.push({
      pass: false,
      message: 'compatibility_date not set in wrangler.toml',
      fix: 'Add `compatibility_date = "2025-01-01"` to wrangler.toml (use a recent date).',
    });
  }

  return results;
}

function stripTomlComments(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

function checkWorkerEntry(root: string): Diagnostic {
  const entryPath = resolve(root, 'src', 'worker.ts');
  if (existsSync(entryPath)) {
    return {
      pass: true,
      message: 'Worker entry point exists at src/worker.ts.',
    };
  }

  return {
    pass: false,
    message: 'Worker entry point not found at src/worker.ts',
    fix: 'Run `nest-worker new <name>` to scaffold a project or create src/worker.ts manually.',
  };
}

function printDiagnostic(
  label: string,
  diagnostics: Diagnostic | Diagnostic[],
): void {
  const items = Array.isArray(diagnostics) ? diagnostics : [diagnostics];

  console.log(`  ${pc.bold(label)}`);

  for (const diag of items) {
    const icon = diag.pass ? pc.green('✓') : pc.red('✗');
    const color = diag.pass ? pc.green : pc.red;
    console.log(`  ${icon} ${color(diag.message)}`);

    if (!diag.pass && diag.fix) {
      console.log(`     ${pc.dim('💡')} ${pc.dim(diag.fix)}`);
    }
  }

  console.log('');
}

export function doctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd.description('Check project configuration for common issues');
  cmd.action(() => {
    console.log(pc.bold('\n🩺 nest-worker Doctor\n'));

    const projectRoot = findProjectRoot();
    const project = detectProject(projectRoot);

    console.log(
      `  ${pc.dim('Checking project at:')} ${pc.white(project.root)}\n`,
    );

    // 1. Dependencies
    printDiagnostic('Dependencies', checkDependencies(projectRoot));

    // 2. TypeScript configuration
    printDiagnostic('TypeScript Config', checkTsConfig(projectRoot));

    // 3. Worker entry point
    printDiagnostic('Entry Point', checkWorkerEntry(projectRoot));

    // 4. Wrangler configuration
    printDiagnostic('Wrangler Config', checkWrangler(projectRoot));

    // Tally results
    const all: Diagnostic[] = [
      checkDependencies(projectRoot),
      checkWorkerEntry(projectRoot),
      ...checkTsConfig(projectRoot),
      ...checkWrangler(projectRoot),
    ];

    const passed = all.filter((d) => d.pass).length;
    const failed = all.filter((d) => !d.pass).length;

    if (failed === 0) {
      console.log(
        pc.green(`  ✅ All ${passed} checks passed. Your project looks good!\n`),
      );
    } else {
      console.log(
        pc.yellow(
          `  ⚠️  ${failed} of ${all.length} checks failed. ${passed} passed.\n`,
        ),
      );
      console.log(
        pc.dim(
          '  Review the issues above. Most can be fixed by following the suggestions.\n',
        ),
      );
    }
  });
  return cmd;
}
