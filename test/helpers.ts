import { D1Database } from "../src/core/types";
import { QueryBuilder } from "../src/database/query-builder";

/**
 * Create a simple mock D1Database that captures the SQL and bindings.
 */
export function createMockD1(): {
  db: D1Database;
  statements: Array<{ sql: string; bindings: unknown[] }>;
} {
  const statements: Array<{ sql: string; bindings: unknown[] }> = [];

  const db: D1Database = {
    prepare: (query: string) => {
      const entry = { sql: query, bindings: [] as unknown[] };
      statements.push(entry);
      return {
        bind: (...values: unknown[]) => {
          entry.bindings = values;
          return {
            all: async <T>() => ({
              results: [] as T[],
              success: true,
              meta: { duration: 0 },
            }),
            first: async <T>() => null as T | null,
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
        first: async <T>() => null as T | null,
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
