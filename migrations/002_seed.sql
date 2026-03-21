-- migrations/002_seed.sql
-- Run with: wrangler d1 execute my-app-db --file=./migrations/002_seed.sql

INSERT INTO users (name, email, role) VALUES
  ('Alice Admin',   'alice@example.com', 'admin'),
  ('Bob User',      'bob@example.com',   'user'),
  ('Carol Manager', 'carol@example.com', 'manager');
