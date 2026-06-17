import {
  D1Database,
  D1PreparedStatement,
  D1Result,
  sanitizeIdentifier,
} from "../core/types";

/**
 * Base repository class with common query helpers for D1.
 * Extend this class and inject a D1Database binding.
 * All column and table names are sanitized against SQL injection.
 */
export class D1Repository<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  private readonly safeTableName: string;

  constructor(
    protected readonly db: D1Database,
    protected readonly tableName: string,
  ) {
    this.safeTableName = sanitizeIdentifier(tableName);
  }

  /** Find all rows */
  async findAll(): Promise<T[]> {
    const result = await this.db
      .prepare(`SELECT * FROM ${this.safeTableName}`)
      .all<T>();
    return result.results || [];
  }

  /** Find one by primary key (id) */
  async findById(id: number | string): Promise<T | null> {
    return this.db
      .prepare(`SELECT * FROM ${this.safeTableName} WHERE id = ?`)
      .bind(id)
      .first<T>();
  }

  /** Find rows matching a WHERE clause */
  async findWhere(where: Partial<T>): Promise<T[]> {
    const keys = Object.keys(where);
    if (!keys.length) return this.findAll();

    const clauses = keys
      .map((k) => `${sanitizeIdentifier(k)} = ?`)
      .join(" AND ");
    const values = Object.values(where);
    const result = await this.db
      .prepare(`SELECT * FROM ${this.safeTableName} WHERE ${clauses}`)
      .bind(...values)
      .all<T>();
    return result.results || [];
  }

  /** Find first row matching a WHERE clause */
  async findOneWhere(where: Partial<T>): Promise<T | null> {
    const keys = Object.keys(where);
    if (!keys.length) return null;

    const clauses = keys
      .map((k) => `${sanitizeIdentifier(k)} = ?`)
      .join(" AND ");
    const values = Object.values(where);
    return this.db
      .prepare(`SELECT * FROM ${this.safeTableName} WHERE ${clauses} LIMIT 1`)
      .bind(...values)
      .first<T>();
  }

  /** Insert a row and return the created record */
  async create(data: Omit<T, "id">): Promise<D1Result<T>> {
    const keys = Object.keys(data).map(sanitizeIdentifier);
    const placeholders = keys.map(() => "?").join(", ");
    const values = Object.values(data);
    return this.db
      .prepare(
        `INSERT INTO ${this.safeTableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      )
      .bind(...values)
      .run<T>();
  }

  /** Update a row by id */
  async update(
    id: number | string,
    data: Partial<Omit<T, "id">>,
  ): Promise<D1Result<T>> {
    const keys = Object.keys(data);
    if (!keys.length) throw new Error("No fields to update");
    const setClause = keys
      .map((k) => `${sanitizeIdentifier(k)} = ?`)
      .join(", ");
    const values = [...Object.values(data), id];
    return this.db
      .prepare(`UPDATE ${this.safeTableName} SET ${setClause} WHERE id = ?`)
      .bind(...values)
      .run<T>();
  }

  /** Delete a row by id */
  async delete(id: number | string): Promise<D1Result<T>> {
    return this.db
      .prepare(`DELETE FROM ${this.safeTableName} WHERE id = ?`)
      .bind(id)
      .run<T>();
  }

  /** Raw query with bindings */
  async raw<R = T>(query: string, ...bindings: unknown[]): Promise<R[]> {
    const result = await this.db
      .prepare(query)
      .bind(...bindings)
      .all<R>();
    return result.results || [];
  }

  /** Raw query returning first result */
  async rawFirst<R = T>(
    query: string,
    ...bindings: unknown[]
  ): Promise<R | null> {
    return this.db
      .prepare(query)
      .bind(...bindings)
      .first<R>();
  }

  /** Count rows */
  async count(where?: Partial<T>): Promise<number> {
    let stmt: D1PreparedStatement;
    if (where && Object.keys(where).length) {
      const keys = Object.keys(where);
      const clauses = keys
        .map((k) => `${sanitizeIdentifier(k)} = ?`)
        .join(" AND ");
      stmt = this.db
        .prepare(
          `SELECT COUNT(*) as count FROM ${this.safeTableName} WHERE ${clauses}`,
        )
        .bind(...Object.values(where));
    } else {
      stmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM ${this.safeTableName}`,
      );
    }
    const row = await stmt.first<{ count: number }>();
    return row?.count ?? 0;
  }
}
