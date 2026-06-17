import { describe, it, expect } from 'vitest';
import { createMockD1 } from './helpers';
import { D1Repository } from '../src/database/repository';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

describe('D1Repository', () => {
  describe('SQL injection prevention', () => {
    it('should reject malicious table names in constructor', () => {
      const { db } = createMockD1();
      expect(() => new D1Repository(db, 'users; DROP TABLE users')).toThrow();
      expect(() => new D1Repository(db, "users'--")).toThrow();
    });

    it('should sanitize column names in findWhere', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.findWhere({ name: 'Alice' } as Partial<User>);

      expect(statements[0].sql).toContain('name = ?');
    });

    it('should sanitize column names in create', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.create({ name: 'Alice', email: 'a@b.com', role: 'user' } as any);

      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO users');
      expect(sql).toContain('name, email, role');
    });

    it('should sanitize column names in update', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.update(1, { name: 'Bob' } as any);

      expect(statements[0].sql).toContain('SET name = ?');
      expect(statements[0].sql).toContain('WHERE id = ?');
      expect(statements[0].bindings).toEqual(['Bob', 1]);
    });

    it('should sanitize column names in count with where', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.count({ role: 'admin' } as Partial<User>);

      expect(statements[0].sql).toContain('COUNT(*)');
      expect(statements[0].sql).toContain('role = ?');
      expect(statements[0].bindings).toEqual(['admin']);
    });
  });

  describe('CRUD operations', () => {
    it('findAll should query all rows', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.findAll();

      expect(statements[0].sql).toBe('SELECT * FROM users');
    });

    it('findById should query by id', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.findById(42);

      expect(statements[0].sql).toContain('WHERE id = ?');
      expect(statements[0].bindings).toEqual([42]);
    });

    it('delete should use parameterized id', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository<User>(db, 'users');
      await repo.delete(7);

      expect(statements[0].sql).toContain('DELETE FROM users');
      expect(statements[0].sql).toContain('WHERE id = ?');
      expect(statements[0].bindings).toEqual([7]);
    });

    it('raw and rawFirst should pass through safely', async () => {
      const { db, statements } = createMockD1();
      const repo = new D1Repository(db, 'users');
      await repo.raw('SELECT 1');
      await repo.rawFirst('SELECT 2');

      expect(statements[0].sql).toBe('SELECT 1');
      expect(statements[1].sql).toBe('SELECT 2');
    });
  });
});
