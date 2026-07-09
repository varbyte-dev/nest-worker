import { describe, it, expect } from 'vitest';
import { createMockD1 } from './helpers';
import { QueryBuilder } from '../src/database/query-builder';

describe('QueryBuilder', () => {
  describe('SQL injection prevention', () => {
    it('should reject malicious table names', () => {
      const { db } = createMockD1();
      expect(() => new QueryBuilder(db, 'users; DROP TABLE users')).toThrow();
      expect(() => new QueryBuilder(db, "users'--")).toThrow();
    });

    it('should reject malicious column names in select', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.select('id; DROP TABLE users')).toThrow();
      expect(() => qb.select("password'--")).toThrow();
    });

    it('should accept wildcard select', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.select('*')).not.toThrow();
    });

    it('should accept table.column notation', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.select('users.id', 'users.name')).not.toThrow();
    });

    it('should reject malicious column names in where', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.where('id; DROP TABLE users', 1)).toThrow();
    });

    it('should reject invalid operators in where', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.where('id', 1, 'INJECTION')).toThrow();
      expect(() => qb.where('id', 1, '')).toThrow();
    });

    it('should reject non-scalar operators in generic where', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.where('id', [1, 2], 'IN')).toThrow(
        'Use whereIn() for IN clauses',
      );
      expect(() => qb.where('id', [1, 2], 'BETWEEN')).toThrow(
        'Use whereBetween() for BETWEEN clauses',
      );
      expect(() => qb.where('deleted_at', null, 'IS')).toThrow(
        'Use whereNull() for NULL checks',
      );
    });

    it('should reject malicious column names in orderBy', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.orderBy('id; DROP TABLE users')).toThrow();
    });

    it('should reject invalid order direction', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      expect(() => qb.orderBy('id', 'INVALID' as any)).toThrow();
    });
  });

  describe('query building', () => {
    it('should build a simple SELECT', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.all();

      expect(statements[0].sql).toBe('SELECT * FROM users');
    });

    it('should build SELECT with specific columns', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.select('id', 'name', 'email').all();

      expect(statements[0].sql).toBe('SELECT id, name, email FROM users');
    });

    it('should build SELECT with WHERE clause', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.where('role', 'admin').where('active', 1).all();

      expect(statements[0].sql).toContain('WHERE role = ? AND active = ?');
      expect(statements[0].bindings).toEqual(['admin', 1]);
    });

    it('should build SELECT with ORDER BY', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.orderBy('created_at', 'DESC').all();

      expect(statements[0].sql).toContain('ORDER BY created_at DESC');
    });

    it('should build SELECT with LIMIT and OFFSET using parameterized bindings', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.limit(10).offset(20).all();

      // LIMIT and OFFSET must use ? bindings, not interpolation
      expect(statements[0].sql).toContain('LIMIT ?');
      expect(statements[0].sql).toContain('OFFSET ?');
      expect(statements[0].bindings).toContain(10);
      expect(statements[0].bindings).toContain(20);
    });

    it('should prepend LIMIT -1 when offset is set without limit', async () => {
      const { db, statements } = createMockD1();
      await new QueryBuilder(db, 'users').offset(5).all();
      expect(statements[0].sql).toContain('LIMIT -1');
      expect(statements[0].sql).toContain('OFFSET ?');
      expect(statements[0].bindings).toContain(5);
    });

    it('should accept string numeric values for limit/offset (coercion)', async () => {
      const { db, statements } = createMockD1();
      await new QueryBuilder(db, 'users').limit('10' as any).all();
      expect(statements[0].sql).toContain('LIMIT ?');
      expect(statements[0].bindings).toContain(10);
    });

    it('should reject injection payloads, negatives, floats, NaN, and non-numerics in limit', () => {
      const { db } = createMockD1();
      const qb = () => new QueryBuilder(db, 'users');
      expect(() => qb().limit(-1)).toThrow('limit()');
      expect(() => qb().limit(1.5)).toThrow('limit()');
      expect(() => qb().limit(NaN)).toThrow('limit()');
      expect(() => qb().limit('1; DROP TABLE users' as any)).toThrow('limit()');
    });

    it('should reject invalid offset values', () => {
      const { db } = createMockD1();
      const qb = () => new QueryBuilder(db, 'users');
      expect(() => qb().offset(-1)).toThrow('offset()');
      expect(() => qb().offset(NaN)).toThrow('offset()');
      expect(() => qb().offset(undefined as any)).toThrow('offset()');
      expect(() => qb().offset(1.5)).toThrow('offset()');
    });

    it('should build COUNT query', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.where('role', 'admin').count();

      expect(statements[0].sql).toContain('COUNT(*)');
      expect(statements[0].sql).toContain('WHERE role = ?');
      expect(statements[0].bindings).toEqual(['admin']);
    });

    it('should build WHERE IN clauses', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.whereIn('role', ['admin', 'owner']).all();

      expect(statements[0].sql).toContain('WHERE role IN (?, ?)');
      expect(statements[0].bindings).toEqual(['admin', 'owner']);
    });

    it('should build WHERE NOT IN clauses', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.whereNotIn('role', ['guest', 'blocked']).all();

      expect(statements[0].sql).toContain('WHERE role NOT IN (?, ?)');
      expect(statements[0].bindings).toEqual(['guest', 'blocked']);
    });

    it('should reject empty IN clauses', () => {
      const { db } = createMockD1();
      const qb = new QueryBuilder(db, 'users');

      expect(() => qb.whereIn('id', [])).toThrow(
        'whereIn() requires at least one value',
      );
    });

    it('should build WHERE BETWEEN clauses', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.whereBetween('created_at', '2026-01-01', '2026-12-31').all();

      expect(statements[0].sql).toContain('WHERE created_at BETWEEN ? AND ?');
      expect(statements[0].bindings).toEqual(['2026-01-01', '2026-12-31']);
    });

    it('should build NULL checks without bindings', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.whereNull('deleted_at').whereNotNull('email').all();

      expect(statements[0].sql).toContain(
        'WHERE deleted_at IS NULL AND email IS NOT NULL',
      );
      expect(statements[0].bindings).toEqual([]);
    });

    it('should reuse explicit operators in COUNT queries', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb
        .whereIn('role', ['admin', 'owner'])
        .whereNull('deleted_at')
        .count();

      expect(statements[0].sql).toContain(
        'WHERE role IN (?, ?) AND deleted_at IS NULL',
      );
      expect(statements[0].bindings).toEqual(['admin', 'owner']);
    });
  });
});
