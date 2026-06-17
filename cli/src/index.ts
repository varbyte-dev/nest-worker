#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { newCommand } from './commands/new.command.js';
import { generateCommand } from './commands/generate/generate.command.js';
import { infoCommand } from './commands/info.command.js';
import { listCommand } from './commands/list.command.js';
import { doctorCommand } from './commands/doctor.command.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(__dirname, '..', 'package.json');
  if (existsSync(pkgPath)) {
    try {
      return JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.0.0';
    } catch {
      // fallback
    }
  }
  return '0.0.0';
}

export function run() {
  const program = new Command();

  program
    .name('nest-worker')
    .description('CLI tool for @varbyte/nest-worker — scaffolding and code generation')
    .version(getVersion(), '-v, --version', 'Display CLI version');

  program.addCommand(newCommand());
  program.addCommand(generateCommand());
  program.addCommand(infoCommand());
  program.addCommand(listCommand());
  program.addCommand(doctorCommand());

  program.parse(process.argv);
}
