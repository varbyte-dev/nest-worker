/**
 * Naming conventions for nest-worker CLI.
 * Converts between: PascalCase, camelCase, kebab-case, snake_case, plural, singular.
 */

export interface NameInfo {
  /** kebab-case */
  kebab: string;
  /** PascalCase */
  pascal: string;
  /** camelCase */
  camel: string;
  /** snake_case */
  snake: string;
  /** Human readable (e.g. "User Role") */
  human: string;
}

export function parseName(input: string): NameInfo {
  // Normalize: split on non-alphanumeric and case transitions
  const words =
    input
      .replace(/([A-Z])/g, " $1")
      .split(/[^a-zA-Z0-9]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean) || [];

  if (!words.length) throw new Error(`Invalid name: "${input}"`);

  return {
    kebab: words.join("-"),
    pascal: words.map(capitalize).join(""),
    camel: words.map((w, i) => (i === 0 ? w : capitalize(w))).join(""),
    snake: words.join("_"),
    human: words.map(capitalize).join(" "),
  };
}

export function capitalize(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Simple pluralization for English words.
 * If the word already looks plural (ends in 's'), returns it as-is.
 */
export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  // Already plural — return unchanged
  if (lower.endsWith("s") && lower.length > 2) return word;
  if (/(s|sh|ch|x|z)$/i.test(lower)) return word + "es";
  if (/([^aeiou])y$/i.test(lower)) return word.slice(0, -1) + "ies";
  if (/(f|fe)$/i.test(lower)) return word.slice(0, -1) + "ves";
  return word + "s";
}

/**
 * Directory name for module-based generators (e.g. "users" → "users").
 * Uses kebab-case by default.
 */
export function moduleDirName(input: string): string {
  return parseName(input).kebab;
}

/**
 * File name for generated files (e.g. "users.controller").
 */
export function fileName(prefix: NameInfo, suffix: string): string {
  return `${prefix.kebab}.${suffix}`;
}
