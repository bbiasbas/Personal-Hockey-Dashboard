import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Runs db/migrations/*.sql that haven't run yet, in filename order.
async function migrate() {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query('select name from schema_migrations')).rows.map((r) => r.name));
  const dir = new URL('../db/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(await readFile(new URL(file, dir), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }
}

let ready: Promise<void> | null = null;
// Connects and migrates once; retries next call if Postgres was down.
export function ensureDb() {
  ready ??= migrate().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
