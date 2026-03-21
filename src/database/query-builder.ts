import { D1Database } from '../core/types';

type OrderDirection = 'ASC' | 'DESC';

/**
 * Fluent query builder for D1.
 * Usage: new QueryBuilder(db, 'users').select('id', 'name').where('active', 1).limit(10).all()
 */
export class QueryBuilder<T = Record<string, unknown>> {
  private _select: string[] = ['*'];
  private _wheres: Array<{ col: string; op: string; val: unknown }> = [];
  private _orderBy: Array<{ col: string; dir: OrderDirection }> = [];
  private _limit?: number;
  private _offset?: number;

  constructor(
    private readonly db: D1Database,
    private readonly table: string
  ) {}

  select(...cols: string[]): this {
    this._select = cols;
    return this;
  }

  where(col: string, value: unknown, op: string = '='): this {
    this._wheres.push({ col, op, val: value });
    return this;
  }

  orderBy(col: string, dir: OrderDirection = 'ASC'): this {
    this._orderBy.push({ col, dir });
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
    let sql = `SELECT ${this._select.join(', ')} FROM ${this.table}`;

    if (this._wheres.length) {
      const clauses = this._wheres.map(({ col, op, val }) => {
        bindings.push(val);
        return `${col} ${op} ?`;
      });
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }

    if (this._orderBy.length) {
      const orders = this._orderBy.map(({ col, dir }) => `${col} ${dir}`);
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
    if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;

    return { sql, bindings };
  }

  async all(): Promise<T[]> {
    const { sql, bindings } = this.build();
    const result = await this.db.prepare(sql).bind(...bindings).all<T>();
    return result.results || [];
  }

  async first(): Promise<T | null> {
    const { sql, bindings } = this.build();
    return this.db.prepare(sql).bind(...bindings).first<T>();
  }

  async count(): Promise<number> {
    const bindings: unknown[] = [];
    let sql = `SELECT COUNT(*) as count FROM ${this.table}`;
    if (this._wheres.length) {
      const clauses = this._wheres.map(({ col, op, val }) => {
        bindings.push(val);
        return `${col} ${op} ?`;
      });
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    const row = await this.db.prepare(sql).bind(...bindings).first<{ count: number }>();
    return row?.count ?? 0;
  }
}
