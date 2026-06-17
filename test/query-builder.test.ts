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

    it('should build SELECT with LIMIT and OFFSET', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.limit(10).offset(20).all();

      expect(statements[0].sql).toContain('LIMIT 10');
      expect(statements[0].sql).toContain('OFFSET 20');
    });

    it('should build COUNT query', async () => {
      const { db, statements } = createMockD1();
      const qb = new QueryBuilder(db, 'users');
      await qb.where('role', 'admin').count();

      expect(statements[0].sql).toContain('COUNT(*)');
      expect(statements[0].sql).toContain('WHERE role = ?');
      expect(statements[0].bindings).toEqual(['admin']);
    });
  });
});
