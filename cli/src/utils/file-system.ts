import { mkdir, writeFile, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { promisify } from 'node:util';

const mkdirAsync = promisify(mkdir);
const writeFileAsync = promisify(writeFile);

export function exists(path: string): boolean {
  return existsSync(path);
}

export async function ensureDir(path: string): Promise<void> {
  await mkdirAsync(path, { recursive: true });
}

export async function createFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFileAsync(filePath, content, 'utf-8');
}

/**
 * Writes a file only if it doesn't exist (no overwrite).
 * Returns true if created, false if skipped.
 */
export async function createFileSafe(
  filePath: string,
  content: string,
): Promise<boolean> {
  if (existsSync(filePath)) {
    return false;
  }
  await createFile(filePath, content);
  return true;
}

/**
 * Format a timestamp for migration files: YYYYMMDDHHmmss
 */
export function migrationTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}${h}${min}${s}`;
}
