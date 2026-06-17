import { D1Database, sanitizeIdentifier } from "../core/types";

type OrderDirection = "ASC" | "DESC";

/**
 * Fluent query builder for D1.
 * Usage: new QueryBuilder(db, 'users').select('id', 'name').where('active', 1).limit(10).all()
 */
export class QueryBuilder<T = Record<string, unknown>> {
  private _select: string[] = ["*"];
  private _wheres: Array<{ col: string; op: string; val: unknown }> = [];
  private _orderBy: Array<{ col: string; dir: OrderDirection }> = [];
  private _limit?: number;
  private _offset?: number;

  constructor(
    private readonly db: D1Database,
    private readonly table: string,
  ) {
    // Sanitize table name once at construction
    sanitizeIdentifier(table);
  }

  select(...cols: string[]): this {
    this._select = cols.map((col) => {
      if (col === "*") return col;
      // Handle "table.column" or "alias.column" notation
      const parts = col.split(".");
      if (parts.length > 2)
        throw new Error(`Invalid column identifier: "${col}"`);
      return parts.map(sanitizeIdentifier).join(".");
    });
    return this;
  }

  where(col: string, value: unknown, op: string = "="): this {
    sanitizeIdentifier(col);
    // Validate SQL operator to prevent injection
    const validOps = [
      "=",
      "!=",
      "<>",
      "<",
      ">",
      "<=",
      ">=",
      "LIKE",
      "NOT LIKE",
      "IN",
      "NOT IN",
      "IS",
      "IS NOT",
      "BETWEEN",
    ];
    const normalizedOp = op.toUpperCase();
    if (!validOps.includes(normalizedOp)) {
      throw new Error(`Invalid SQL operator: "${op}"`);
    }
    this._wheres.push({ col, op: normalizedOp, val: value });
    return this;
  }

  orderBy(col: string, dir: OrderDirection = "ASC"): this {
    sanitizeIdentifier(col);
    const normalizedDir = dir.toUpperCase();
    if (normalizedDir !== "ASC" && normalizedDir !== "DESC") {
      throw new Error(`Invalid ORDER BY direction: "${dir}"`);
    }
    this._orderBy.push({ col, dir: normalizedDir as OrderDirection });
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  private build(): { sql: string; bindings: unknown[] } {
    const bindings: unknown[] = [];

    // Sanitize table name before using it (already sanitized in constructor, but safety check)
    const safeTable = sanitizeIdentifier(this.table);
    const selectCols = this._select.map((col) => {
      if (col === "*") return col;
      const parts = col.split(".");
      return parts.map(sanitizeIdentifier).join(".");
    });

    let sql = `SELECT ${selectCols.join(", ")} FROM ${safeTable}`;

    if (this._wheres.length) {
      const clauses = this._wheres.map(({ col, op, val }) => {
        bindings.push(val);
        return `${sanitizeIdentifier(col)} ${op} ?`;
      });
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    if (this._orderBy.length) {
      const orders = this._orderBy.map(
        ({ col, dir }) => `${sanitizeIdentifier(col)} ${dir}`,
      );
      sql += ` ORDER BY ${orders.join(", ")}`;
    }

    if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
    if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;

    return { sql, bindings };
  }

  async all(): Promise<T[]> {
    const { sql, bindings } = this.build();
    const result = await this.db
      .prepare(sql)
      .bind(...bindings)
      .all<T>();
    return result.results || [];
  }

  async first(): Promise<T | null> {
    const { sql, bindings } = this.build();
    return this.db
      .prepare(sql)
      .bind(...bindings)
      .first<T>();
  }

  async count(): Promise<number> {
    const bindings: unknown[] = [];
    const safeTable = sanitizeIdentifier(this.table);
    let sql = `SELECT COUNT(*) as count FROM ${safeTable}`;
    if (this._wheres.length) {
      const clauses = this._wheres.map(({ col, op, val }) => {
        bindings.push(val);
        return `${sanitizeIdentifier(col)} ${op} ?`;
      });
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    const row = await this.db
      .prepare(sql)
      .bind(...bindings)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
}
