import { D1Database, sanitizeIdentifier } from "../core/types";

type OrderDirection = "ASC" | "DESC";

/**
 * Validates that a value is a non-negative integer (or a string that coerces to one).
 * Rejects floats, negatives, NaN, Infinity, null, undefined, and objects.
 */
function assertNonNegativeInteger(n: unknown, name: string): number {
  const num = Number(n);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error(
      `${name}() requires a non-negative integer, got: ${JSON.stringify(n)}`,
    );
  }
  return num;
}
type ScalarOperator =
  | "="
  | "!="
  | "<>"
  | "<"
  | ">"
  | "<="
  | ">="
  | "LIKE"
  | "NOT LIKE";
type WhereClause =
  | { type: "scalar"; col: string; op: ScalarOperator; val: unknown }
  | { type: "in"; col: string; values: unknown[]; negate: boolean }
  | { type: "between"; col: string; min: unknown; max: unknown }
  | { type: "null"; col: string; negate: boolean };

/**
 * Fluent query builder for D1.
 * Usage: new QueryBuilder(db, 'users').select('id', 'name').where('active', 1).limit(10).all()
 */
export class QueryBuilder<T = Record<string, unknown>> {
  private _select: string[] = ["*"];
  private _wheres: WhereClause[] = [];
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
    const scalarOps: ScalarOperator[] = [
      "=",
      "!=",
      "<>",
      "<",
      ">",
      "<=",
      ">=",
      "LIKE",
      "NOT LIKE",
    ];
    const normalizedOp = op.toUpperCase();
    if (normalizedOp === "IN" || normalizedOp === "NOT IN") {
      const method = normalizedOp === "IN" ? "whereIn" : "whereNotIn";
      throw new Error(`Use ${method}() for ${normalizedOp} clauses`);
    }
    if (normalizedOp === "BETWEEN") {
      throw new Error("Use whereBetween() for BETWEEN clauses");
    }
    if (normalizedOp === "IS" || normalizedOp === "IS NOT") {
      throw new Error(
        `Use ${normalizedOp === "IS" ? "whereNull" : "whereNotNull"}() for NULL checks`,
      );
    }
    if (!scalarOps.includes(normalizedOp as ScalarOperator)) {
      throw new Error(`Invalid SQL operator: "${op}"`);
    }
    this._wheres.push({
      type: "scalar",
      col,
      op: normalizedOp as ScalarOperator,
      val: value,
    });
    return this;
  }

  whereIn(col: string, values: unknown[]): this {
    return this.addInClause(col, values, false);
  }

  whereNotIn(col: string, values: unknown[]): this {
    return this.addInClause(col, values, true);
  }

  whereBetween(col: string, min: unknown, max: unknown): this {
    sanitizeIdentifier(col);
    this._wheres.push({ type: "between", col, min, max });
    return this;
  }

  whereNull(col: string): this {
    sanitizeIdentifier(col);
    this._wheres.push({ type: "null", col, negate: false });
    return this;
  }

  whereNotNull(col: string): this {
    sanitizeIdentifier(col);
    this._wheres.push({ type: "null", col, negate: true });
    return this;
  }

  private addInClause(col: string, values: unknown[], negate: boolean): this {
    sanitizeIdentifier(col);
    if (!values.length) {
      const method = negate ? "whereNotIn" : "whereIn";
      throw new Error(`${method}() requires at least one value`);
    }
    this._wheres.push({ type: "in", col, values, negate });
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
    this._limit = assertNonNegativeInteger(n, 'limit');
    return this;
  }

  offset(n: number): this {
    this._offset = assertNonNegativeInteger(n, 'offset');
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
      const clauses = this.buildWhereClauses(bindings);
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    if (this._orderBy.length) {
      const orders = this._orderBy.map(
        ({ col, dir }) => `${sanitizeIdentifier(col)} ${dir}`,
      );
      sql += ` ORDER BY ${orders.join(", ")}`;
    }

    // Use parameterized bindings for LIMIT/OFFSET to prevent SQL injection.
    // SQLite requires LIMIT when OFFSET is present; -1 means "all rows".
    if (this._limit !== undefined) {
      sql += ` LIMIT ?`;
      bindings.push(this._limit);
    }
    if (this._offset !== undefined) {
      if (this._limit === undefined) {
        sql += ` LIMIT -1`; // SQLite: OFFSET requires a preceding LIMIT
      }
      sql += ` OFFSET ?`;
      bindings.push(this._offset);
    }

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
      const clauses = this.buildWhereClauses(bindings);
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    const row = await this.db
      .prepare(sql)
      .bind(...bindings)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  private buildWhereClauses(bindings: unknown[]): string[] {
    return this._wheres.map((where) => {
      const col = sanitizeIdentifier(where.col);

      switch (where.type) {
        case "scalar":
          bindings.push(where.val);
          return `${col} ${where.op} ?`;

        case "in": {
          bindings.push(...where.values);
          const placeholders = where.values.map(() => "?").join(", ");
          return `${col} ${where.negate ? "NOT IN" : "IN"} (${placeholders})`;
        }

        case "between":
          bindings.push(where.min, where.max);
          return `${col} BETWEEN ? AND ?`;

        case "null":
          return `${col} IS ${where.negate ? "NOT " : ""}NULL`;
      }
    });
  }
}
