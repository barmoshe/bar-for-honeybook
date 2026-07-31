import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * The database.
 *
 * This is real PostgreSQL, compiled to WebAssembly and running inside the same
 * process as the app. Not a Postgres-like query layer over something else: the
 * window functions on /console, the LATERAL joins in the seed and the EXPLAIN
 * output on /engineering are all genuinely Postgres doing the work.
 *
 * The honest limitation, stated on the site as well as here: the data lives in
 * the function instance. A cold start begins with an empty database, which is
 * seeded on the spot. Within a warm instance writes persist and a signed
 * contract stays signed; across a cold start they do not.
 *
 * That is a deliberate trade. The alternative was a hosted Postgres, which
 * would mean a connection string this repo is public enough to be careless
 * with, an account that can be suspended out from under a demo, and a provider
 * whose free tier pauses a project nobody visited this week. An embedded
 * database that resets is a smaller lie than a link that returns 500.
 *
 * Everything here speaks the `pg` shape on purpose. `query(sql, params)`
 * returning `{ rows }` is what node-postgres returns, so pointing this at a
 * hosted Postgres later is a change to this file and to nothing that calls it.
 */

type Row = Record<string, unknown>;

export type QueryResult<T> = { rows: T[]; affectedRows: number };

const SQL_DIR = path.join(process.cwd(), "lib", "db");

async function sqlFile(name: string): Promise<string> {
  return readFile(path.join(SQL_DIR, name), "utf8");
}

function dataDir(): string | undefined {
  if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
  // On Vercel only /tmp is writable, and it is per-instance, which is exactly
  // the lifetime this database has anyway.
  if (process.env.VERCEL) return "/tmp/hb-smartfile";
  // Locally, persist beside the repo so a hot reload does not wipe the file you
  // were halfway through signing.
  return path.join(process.cwd(), ".pglite");
}

/**
 * Next reloads modules on edit in development, and a second PGlite on the same
 * data directory would fail: it takes a single exclusive connection. Parking
 * the instance on globalThis is the standard way to survive that, and it costs
 * nothing in production where modules are loaded once.
 */
const globalForDb = globalThis as unknown as {
  __hbDb?: Promise<PGlite>;
};

async function boot(): Promise<PGlite> {
  const db = await PGlite.create({ dataDir: dataDir() });
  // CREATE TABLE IF NOT EXISTS throughout, so booting against a persisted
  // directory is a no-op rather than an error.
  await db.exec(await sqlFile("schema.sql"));
  return db;
}

function connection(): Promise<PGlite> {
  globalForDb.__hbDb ??= boot();
  return globalForDb.__hbDb;
}

/**
 * Runs one parameterised statement. Every call site in this app passes values
 * as parameters; there is no string interpolation into SQL anywhere in the
 * repo, which is a claim you can check with a grep for a backtick next to a
 * SELECT.
 */
export async function query<T = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const db = await connection();
  const res = await db.query<T>(sql, params);
  return { rows: res.rows as T[], affectedRows: res.affectedRows ?? 0 };
}

/** Runs one statement and returns the first row, or null. */
export async function queryOne<T = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const { rows } = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction.
 *
 * PGlite holds a single connection, so this is a plain BEGIN/COMMIT rather than
 * a pool checkout. The signature still takes the same shape a pooled client
 * would, so the swap to hosted Postgres stays a change to this file only.
 */
export async function transaction<T>(
  fn: (tx: {
    query: <R = Row>(sql: string, params?: unknown[]) => Promise<QueryResult<R>>;
  }) => Promise<T>,
): Promise<T> {
  const db = await connection();
  await db.exec("BEGIN");
  try {
    const result = await fn({
      query: async <R = Row>(sql: string, params: unknown[] = []) => {
        const res = await db.query<R>(sql, params);
        return { rows: res.rows as R[], affectedRows: res.affectedRows ?? 0 };
      },
    });
    await db.exec("COMMIT");
    return result;
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Creates a workspace and seeds its back catalogue, or does nothing if it is
 * already there.
 *
 * The seed is several statements, and a parameterised query is one, so the
 * workspace id goes in as a session setting via set_config with a real bind
 * parameter. current_setting reads it back inside the SQL file. That is the
 * same mechanism row-level security uses to scope a tenant in production, so
 * it is not a shortcut invented for this demo.
 */
export async function ensureWorkspace(id: string): Promise<{ seeded: boolean }> {
  const db = await connection();

  const existing = await db.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE id = $1",
    [id],
  );
  if (existing.rows.length > 0) {
    await db.query(
      "UPDATE workspaces SET last_seen_at = now() WHERE id = $1",
      [id],
    );
    return { seeded: false };
  }

  const seed = await sqlFile("seed-workspace.sql");

  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO workspaces (id) VALUES ($1)", [id]);
    // `false` means the setting outlives the surrounding transaction block in
    // this session, which is what the multi-statement exec below needs.
    await db.query("SELECT set_config('app.workspace_id', $1, false)", [id]);
    await db.exec(seed);
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }

  return { seeded: true };
}

/** Runs EXPLAIN ANALYZE and returns the plan as lines, for /engineering. */
export async function explain(
  sql: string,
  params: unknown[] = [],
): Promise<string[]> {
  const { rows } = await query<Record<string, string>>(
    `EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE false, FORMAT TEXT) ${sql}`,
    params,
  );
  return rows.map((r) => Object.values(r)[0]);
}
