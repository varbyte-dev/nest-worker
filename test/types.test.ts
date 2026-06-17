import { describe, it, expect } from 'vitest';
import { sanitizeIdentifier } from '../src/core/types';

describe('sanitizeIdentifier', () => {
  it('should allow valid identifiers', () => {
    expect(sanitizeIdentifier('id')).toBe('id');
    expect(sanitizeIdentifier('user_name')).toBe('user_name');
    expect(sanitizeIdentifier('_private')).toBe('_private');
    expect(sanitizeIdentifier('a1b2c3')).toBe('a1b2c3');
  });

  it('should reject empty strings', () => {
    expect(() => sanitizeIdentifier('')).toThrow('SQL identifier cannot be empty');
  });

  it('should reject identifiers with spaces', () => {
    expect(() => sanitizeIdentifier('col name')).toThrow();
  });

  it('should reject identifiers starting with numbers', () => {
    expect(() => sanitizeIdentifier('1column')).toThrow();
  });

  it('should reject SQL injection attempts', () => {
    expect(() => sanitizeIdentifier('id; DROP TABLE users')).toThrow();
    expect(() => sanitizeIdentifier("name' OR '1'='1")).toThrow();
    expect(() => sanitizeIdentifier('id--')).toThrow();
    expect(() => sanitizeIdentifier('(SELECT * FROM users)')).toThrow();
  });

  it('should reject dotted identifiers (handled at caller level)', () => {
    // sanitizeIdentifier itself does not allow dots; callers split first
    expect(() => sanitizeIdentifier('table.col')).toThrow();
  });
});
