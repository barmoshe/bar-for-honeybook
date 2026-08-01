import "server-only";

import { query, transaction } from "./db/client.ts";
import * as db from "./db/queries.ts";
import { advanceRun, resolveDocument } from "./engine-server.ts";
import type { Automation, Facts, TickResult, TriggerKind } from "./engine.ts";

/**
 * The automation runner.
 *
 * Same split as everything else here: **deciding is a pure Go function, state
 * is Postgres.** This module is the part that cannot be pure, and it is
 * deliberately small: enqueue a run when a trigger fires, claim runs that are
 * due, ask the engine what happens next, write it down.
 *
 * # What this is not
 *
 * It is not durable execution. There is no retry with backoff, no heartbeat, no
 * cancellation, no versioning of a definition while runs are in flight against
 * it. Those are most of the reasons Temporal exists, and their absence is the
 * reason nobody should run this in production. What is here is the shape.
 *
 * # Ticking, honestly
 *
 * A free Vercel plan has no background worker, so due runs advance when someone
 * asks: on a page load, or when a person presses the control. Rather than fake
 * a clock, `asOf` is a parameter all the way down to the Go function, so "jump
 * forward three days" is the same mechanism the tests use, not a simulation of
 * it. A three-day wait becomes a click and the page says exactly that.
 */

/** A run row, as the console reads it. */
export type RunRow = {
  id: string;
  automation_id: string;
  automation_name: string;
  document_id: string;
  document_title: string;
  client: string;
  token: string;
  status: string;
  cursor: number;
  resume_at: string | null;
  attempts: number;
  last_error: string | null;
  started_at: string;
  updated_at: string;
  steps: number;
};

export type LogRow = {
  id: string;
  run_id: string;
  step_index: number | null;
  kind: string;
  detail: Record<string, unknown>;
  at: string;
};

export type OutboxRow = {
  id: string;
  subject: string;
  body: string;
  document_title: string;
  client: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function listAutomations(workspaceId: string) {
  return query<{
    id: string;
    name: string;
    trigger_kind: string;
    enabled: boolean;
    definition: Automation;
    runs: string;
    waiting: string;
  }>(
    `SELECT a.id, a.name, a.trigger_kind, a.enabled, a.definition,
            COALESCE(r.runs, 0)::text    AS runs,
            COALESCE(r.waiting, 0)::text AS waiting
       FROM automations a
       LEFT JOIN LATERAL (
         SELECT count(*) AS runs,
                count(*) FILTER (WHERE status = 'waiting') AS waiting
           FROM automation_runs ar
          WHERE ar.automation_id = a.id
       ) r ON true
      WHERE a.workspace_id = $1
      ORDER BY a.created_at`,
    [workspaceId],
  );
}

export function listRuns(workspaceId: string, limit = 40) {
  return query<RunRow>(
    `SELECT
       r.id::text,
       r.automation_id,
       a.name AS automation_name,
       r.document_id,
       d.title AS document_title,
       d.client,
       d.token,
       r.status,
       r.cursor,
       r.resume_at,
       r.attempts,
       r.last_error,
       r.started_at,
       r.updated_at,
       jsonb_array_length(a.definition->'steps') AS steps
     FROM automation_runs r
     JOIN automations a ON a.id = r.automation_id
     JOIN documents d   ON d.id = r.document_id
     WHERE r.workspace_id = $1
     ORDER BY r.updated_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  );
}

export function runLog(runId: string, limit = 200) {
  return query<LogRow>(
    `SELECT id::text, run_id::text, step_index, kind, detail, at
       FROM automation_log
      WHERE run_id = $1
      ORDER BY id
      LIMIT $2`,
    [runId, limit],
  );
}

export function listOutbox(workspaceId: string, limit = 25) {
  return query<OutboxRow>(
    `SELECT o.id::text, o.subject, o.body, d.title AS document_title, d.client, o.created_at
       FROM outbox o
       JOIN documents d ON d.id = o.document_id
      WHERE o.workspace_id = $1
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $2`,
    [workspaceId, limit],
  );
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/**
 * Starts a run for every enabled automation listening for this trigger.
 *
 * `ON CONFLICT DO NOTHING` against the (automation, document) unique index is
 * the entire guard against a trigger that fires twice: a client who opens the
 * same link ten times gets one run, decided by the database rather than by a
 * read-then-write here.
 *
 * Runs start as `waiting` with `resume_at = now()`, which means "due
 * immediately". Giving the queue one state to look at rather than two is worth
 * more than the honesty of a separate `ready`.
 */
export async function enqueue(
  workspaceId: string,
  documentId: string,
  trigger: TriggerKind,
): Promise<{ started: number }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO automation_runs (workspace_id, automation_id, document_id, status, cursor, resume_at)
     SELECT $1, a.id, $2, 'waiting', 0, now()
       FROM automations a
      WHERE a.workspace_id = $1 AND a.enabled AND a.trigger_kind = $3
     ON CONFLICT (automation_id, document_id) DO NOTHING
     RETURNING id`,
    [workspaceId, documentId, trigger],
  );

  for (const r of rows) {
    await query(
      `INSERT INTO automation_log (run_id, kind, detail) VALUES ($1, 'started', $2::jsonb)`,
      [r.id, JSON.stringify({ trigger })],
    );
  }

  return { started: rows.length };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** Gathers what the engine is told about a document. */
async function factsFor(documentId: string): Promise<Facts & { title: string }> {
  const doc = await db.documentByIdOnly(documentId);
  if (!doc) throw new Error(`no document ${documentId}`);

  const state = await db.clientState(doc.id);
  const resolved = await resolveDocument(doc.doc, state);

  const signed = Object.values(state.signed ?? {}).some((s) => s.trim() !== "");

  return {
    signed,
    paid: (state.paidCents ?? 0) > 0,
    complete: resolved.complete,
    totalCents: resolved.totals.totalCents,
    balanceCents: resolved.totals.balanceCents,
    client: doc.client,
    business: doc.business,
    title: doc.title,
    currency: doc.currency,
  };
}

/**
 * Advances every run that is due as of `asOf`.
 *
 * The claim uses `FOR UPDATE SKIP LOCKED`, which is the standard Postgres queue
 * pattern and not a flourish: it lets two workers pull disjoint batches without
 * blocking each other, and it is the reason this shape survives having more
 * than one caller. PGlite holds a single connection so nothing here actually
 * contends, but writing the toy version would teach the wrong thing.
 *
 * Each run is advanced in its own transaction. One automation whose definition
 * is broken must not roll back the work of the others in the same tick.
 */
export async function tick(
  workspaceId: string,
  asOf: Date = new Date(),
  limit = 25,
): Promise<TickResult> {
  const stamp = asOf.toISOString();

  const claimed = await query<{ id: string; automation_id: string; document_id: string; cursor: number }>(
    `SELECT id, automation_id, document_id, cursor
       FROM automation_runs
      WHERE workspace_id = $1
        AND status = 'waiting'
        AND resume_at <= $2::timestamptz
      ORDER BY resume_at
      FOR UPDATE SKIP LOCKED
      LIMIT $3`,
    [workspaceId, stamp, limit],
  );

  let advanced = 0;
  let actions = 0;

  for (const run of claimed.rows) {
    try {
      const performed = await advanceOne(workspaceId, run, stamp);
      advanced++;
      actions += performed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A run that throws is parked with its error rather than retried forever.
      // Real durable execution would back off and try again; saying plainly
      // that this one does not is better than implying it does.
      await query(
        `UPDATE automation_runs
            SET status = 'stopped', resume_at = NULL, last_error = $2,
                attempts = attempts + 1, updated_at = now()
          WHERE id = $1`,
        [run.id, message.slice(0, 500)],
      );
      await query(
        `INSERT INTO automation_log (run_id, kind, detail) VALUES ($1, 'error', $2::jsonb)`,
        [run.id, JSON.stringify({ message: message.slice(0, 500) })],
      );
    }
  }

  return { claimed: claimed.rows.length, advanced, actions, asOf: stamp };
}

async function advanceOne(
  workspaceId: string,
  run: { id: string; automation_id: string; document_id: string; cursor: number },
  stamp: string,
): Promise<number> {
  const auto = await query<{ definition: Automation }>(
    `SELECT definition FROM automations WHERE id = $1`,
    [run.automation_id],
  );
  const definition = auto.rows[0]?.definition;
  if (!definition) throw new Error("the automation was deleted mid-run");

  const facts = await factsFor(run.document_id);
  const result = await advanceRun(definition, run.cursor, facts, stamp);

  return transaction(async (tx) => {
    let performed = 0;

    for (const action of result.actions) {
      performed++;
      if (action.kind === "email") {
        await tx.query(
          `INSERT INTO outbox (workspace_id, document_id, run_id, subject, body)
           VALUES ($1, $2, $3, $4, $5)`,
          [workspaceId, run.document_id, run.id, action.subject ?? "", action.body ?? ""],
        );
      }
      await tx.query(
        `INSERT INTO automation_log (run_id, step_index, kind, detail)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [run.id, action.stepIndex, action.kind, JSON.stringify(action)],
      );
    }

    if (result.note) {
      await tx.query(
        `INSERT INTO automation_log (run_id, step_index, kind, detail)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [run.id, result.cursor, result.status, JSON.stringify({ note: result.note })],
      );
    }

    await tx.query(
      `UPDATE automation_runs
          SET status = $2, cursor = $3, resume_at = $4::timestamptz,
              attempts = attempts + 1, updated_at = now()
        WHERE id = $1`,
      [
        run.id,
        result.status,
        result.cursor,
        result.status === "waiting" ? (result.resumeAt ?? stamp) : null,
      ],
    );

    return performed;
  });
}
