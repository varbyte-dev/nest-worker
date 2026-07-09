import { D1Database } from "../src/core/types";
import { QueryBuilder } from "../src/database/query-builder";

export interface MockD1Options {
  /** Value returned by every `.first()` call on this mock (default: null). */
  firstResult?: unknown;
}

/**
 * Create a simple mock D1Database that captures the SQL and bindings.
 * Pass `firstResult` to control what `.first()` returns (useful for testing
 * methods that SELECT a row back after INSERT/UPDATE).
 */
export function createMockD1(options?: MockD1Options): {
  db: D1Database;
  statements: Array<{ sql: string; bindings: unknown[] }>;
} {
  const statements: Array<{ sql: string; bindings: unknown[] }> = [];
  const resolveFirst = <T>() =>
    Promise.resolve((options?.firstResult ?? null) as T | null);

  const db: D1Database = {
    prepare: (query: string) => {
      const entry = { sql: query, bindings: [] as unknown[] };
      statements.push(entry);
      return {
        bind: (...values: unknown[]) => {
          entry.bindings = values;
          return {
            bind: (..._: unknown[]) => ({ /* unused chained bind */ } as any),
            all: async <T>() => ({
              results: [] as T[],
              success: true,
              meta: { duration: 0 },
            }),
            first: resolveFirst,
            run: async <T>() => ({
              results: [] as T[],
              success: true,
              meta: { duration: 0, last_row_id: 1, changes: 1 },
            }),
            raw: async <T>() => [] as T[],
          };
        },
        all: async <T>() => ({
          results: [] as T[],
          success: true,
          meta: { duration: 0 },
        }),
        first: resolveFirst,
        run: async <T>() => ({
          results: [] as T[],
          success: true,
          meta: { duration: 0, last_row_id: 1, changes: 1 },
        }),
        raw: async <T>() => [] as T[],
      };
    },
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
  };

  return { db, statements };
}
