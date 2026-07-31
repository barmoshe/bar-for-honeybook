import "server-only";

import { query, queryOne, transaction } from "./client.ts";
import type { ClientState, SmartFileDoc } from "../engine.ts";

/**
 * Every SQL statement in the app, written by hand.
 *
 * There is no ORM and no query builder here on purpose. The interesting parts
 * of this schema are the parts a builder hides: a four-table gather to rebuild
 * one client's state, a window function that accumulates revenue across months,
 * a LATERAL join that prices a jsonb block tree. Those are easier to read as
 * SQL than as method chains, and they are the reason the database is here.
 *
 * Every value crosses into Postgres as a bind parameter. Nothing in this file
 * concatenates a value into a statement.
 */

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentRow = {
  id: string;
  workspace_id: string;
  token: string;
  title: string;
  business: string;
  client: string;
  currency: string;
  doc: SmartFileDoc;
  created_at: string;
};

export function documentByToken(token: string) {
  return queryOne<DocumentRow>(
    `SELECT id, workspace_id, token, title, business, client, currency, doc, created_at
       FROM documents
      WHERE token = $1`,
    [token],
  );
}

export function documentById(workspaceId: string, id: string) {
  return queryOne<DocumentRow>(
    `SELECT id, workspace_id, token, title, business, client, currency, doc, created_at
       FROM documents
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
}

export type DocumentSummary = {
  id: string;
  token: string;
  title: string;
  client: string;
  currency: string;
  created_at: string;
  paid_cents: string;
  signed_at: string | null;
  last_event_at: string | null;
  /** Furthest step the client reached: sent, opened, selected, signed, paid. */
  stage: string;
};

/**
 * The console's file list.
 *
 * One statement rather than a list query plus a per-row lookup. The two LEFT
 * JOIN LATERAL subqueries are aggregates over different tables, so folding them
 * into a single GROUP BY would multiply rows against each other and inflate the
 * money. Keeping them lateral means each aggregate sees only its own table.
 *
 * Index used: ix_documents_workspace (workspace_id, created_at DESC), which
 * covers both the filter and the sort, so there is no sort node in the plan.
 */
export function documentSummaries(workspaceId: string, limit = 50) {
  return query<DocumentSummary>(
    `SELECT
       d.id,
       d.token,
       d.title,
       d.client,
       d.currency,
       d.created_at,
       COALESCE(pay.paid_cents, 0)::text AS paid_cents,
       sig.signed_at,
       ev.last_event_at,
       CASE
         WHEN COALESCE(pay.paid_cents, 0) > 0 THEN 'paid'
         WHEN sig.signed_at IS NOT NULL       THEN 'signed'
         WHEN sel.n > 0                       THEN 'selected'
         WHEN ev.last_event_at IS NOT NULL    THEN 'opened'
         ELSE 'sent'
       END AS stage
     FROM documents d
     LEFT JOIN LATERAL (
       SELECT SUM(p.amount_cents) AS paid_cents
         FROM payment_events p
        WHERE p.document_id = d.id AND p.kind = 'captured'
     ) pay ON true
     LEFT JOIN LATERAL (
       SELECT MIN(g.signed_at) AS signed_at
         FROM signatures g
        WHERE g.document_id = d.id
     ) sig ON true
     LEFT JOIN LATERAL (
       SELECT count(*) AS n FROM selections s WHERE s.document_id = d.id
     ) sel ON true
     LEFT JOIN LATERAL (
       SELECT MAX(e.at) AS last_event_at
         FROM document_events e
        WHERE e.document_id = d.id
     ) ev ON true
     WHERE d.workspace_id = $1
     ORDER BY d.created_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  );
}

export function insertDocument(
  workspaceId: string,
  doc: SmartFileDoc,
  token: string,
) {
  return query(
    `INSERT INTO documents (id, workspace_id, token, title, business, client, currency, doc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE
        SET doc      = EXCLUDED.doc,
            title    = EXCLUDED.title,
            business = EXCLUDED.business,
            client   = EXCLUDED.client,
            currency = EXCLUDED.currency`,
    [
      doc.id,
      workspaceId,
      token,
      doc.title,
      doc.business,
      doc.client,
      doc.currency,
      JSON.stringify(doc),
    ],
  );
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

/**
 * Rebuilds the engine's ClientState for one document.
 *
 * Four tables plus the ledger, gathered in a single round trip with UNION ALL
 * rather than five sequential queries. Each branch tags its rows with a source,
 * and the shapes are reconciled in TypeScript below. It is more SQL than five
 * small selects and considerably less waiting, which is the trade this whole
 * page makes on every keystroke.
 */
export async function clientState(documentId: string): Promise<ClientState> {
  const { rows } = await query<{
    source: string;
    a: string | null;
    b: string | null;
    c: string | null;
    n: string | null;
  }>(
    `  SELECT 'selection' AS source, block_id AS a, option_id AS b, NULL::text AS c, qty::text AS n
         FROM selections   WHERE document_id = $1
   UNION ALL
       SELECT 'signature',          block_id,      signed_name,     NULL,          NULL
         FROM signatures   WHERE document_id = $1
   UNION ALL
       SELECT 'answer',             block_id,      question_id,     answer,        NULL
         FROM answers      WHERE document_id = $1
   UNION ALL
       SELECT 'booking',            block_id,      slot_id,         NULL,          NULL
         FROM bookings     WHERE document_id = $1
   UNION ALL
       SELECT 'paid',               NULL,          NULL,            NULL,
              COALESCE(SUM(amount_cents), 0)::text
         FROM payment_events
        WHERE document_id = $1 AND kind = 'captured'`,
    [documentId],
  );

  const state: ClientState = {
    selections: {},
    answers: {},
    signed: {},
    booked: {},
    paidCents: 0,
  };

  for (const r of rows) {
    switch (r.source) {
      case "selection":
        (state.selections![r.a!] ??= []).push({
          optionId: r.b!,
          qty: Number(r.n ?? 1),
        });
        break;
      case "signature":
        state.signed![r.a!] = r.b!;
        break;
      case "answer":
        (state.answers![r.a!] ??= {})[r.b!] = r.c!;
        break;
      case "booking":
        state.booked![r.a!] = r.b!;
        break;
      case "paid":
        state.paidCents = Number(r.n ?? 0);
        break;
    }
  }

  return state;
}

export function setSelection(
  workspaceId: string,
  documentId: string,
  blockId: string,
  optionId: string,
  qty: number,
) {
  return query(
    `INSERT INTO selections (workspace_id, document_id, block_id, option_id, qty)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (document_id, block_id, option_id) DO UPDATE SET qty = EXCLUDED.qty`,
    [workspaceId, documentId, blockId, optionId, qty],
  );
}

export function clearSelection(
  documentId: string,
  blockId: string,
  optionId: string,
) {
  return query(
    `DELETE FROM selections WHERE document_id = $1 AND block_id = $2 AND option_id = $3`,
    [documentId, blockId, optionId],
  );
}

export function clearBlockSelections(documentId: string, blockId: string) {
  return query(`DELETE FROM selections WHERE document_id = $1 AND block_id = $2`, [
    documentId,
    blockId,
  ]);
}

/**
 * Records a signature.
 *
 * DO NOTHING rather than DO UPDATE: a signature is a fact about a moment, not a
 * field. Someone clicking sign twice signed once, and the second click must not
 * quietly move the timestamp on a record the invoice is gated behind.
 */
export function insertSignature(
  workspaceId: string,
  documentId: string,
  blockId: string,
  name: string,
) {
  return query(
    `INSERT INTO signatures (workspace_id, document_id, block_id, signed_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, block_id) DO NOTHING`,
    [workspaceId, documentId, blockId, name],
  );
}

export function upsertAnswer(
  workspaceId: string,
  documentId: string,
  blockId: string,
  questionId: string,
  answer: string,
) {
  return query(
    `INSERT INTO answers (workspace_id, document_id, block_id, question_id, answer)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (document_id, block_id, question_id) DO UPDATE SET answer = EXCLUDED.answer`,
    [workspaceId, documentId, blockId, questionId, answer],
  );
}

export function upsertBooking(
  workspaceId: string,
  documentId: string,
  blockId: string,
  slotId: string,
) {
  return query(
    `INSERT INTO bookings (workspace_id, document_id, block_id, slot_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, block_id) DO UPDATE SET slot_id = EXCLUDED.slot_id`,
    [workspaceId, documentId, blockId, slotId],
  );
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/**
 * Records a captured payment, once.
 *
 * The idempotency key carries the whole guarantee, enforced by a unique index
 * rather than by this code. There is no read-then-write here and so no window
 * in which two deliveries of the same webhook both decide they are the first.
 * The RETURNING tells the caller which one it was: a row means this call did
 * the work, no row means someone already had.
 */
export async function capturePayment(
  workspaceId: string,
  documentId: string,
  idempotencyKey: string,
  amountCents: number,
  occurredAt?: Date,
): Promise<{ applied: boolean }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payment_events
       (workspace_id, document_id, idempotency_key, kind, amount_cents, occurred_at)
     VALUES ($1, $2, $3, 'captured', $4, COALESCE($5::timestamptz, now()))
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      workspaceId,
      documentId,
      idempotencyKey,
      amountCents,
      occurredAt ? occurredAt.toISOString() : null,
    ],
  );
  return { applied: rows.length > 0 };
}

export type LedgerEntry = {
  id: string;
  idempotency_key: string;
  kind: string;
  amount_cents: string;
  occurred_at: string;
  received_at: string;
  running_cents: string;
  out_of_order: boolean;
};

/**
 * The ledger for one document, with a running balance.
 *
 * The running total is a window function over occurred_at, not over id, which
 * is the point: an event that happened earlier but arrived later sorts into the
 * position it belongs in, and the balance is right either way. out_of_order
 * flags exactly those rows, so /engineering can show the case rather than
 * describe it.
 */
export function ledger(documentId: string) {
  return query<LedgerEntry>(
    `SELECT
       id::text,
       idempotency_key,
       kind,
       amount_cents::text,
       occurred_at,
       received_at,
       SUM(CASE WHEN kind = 'captured' THEN amount_cents ELSE 0 END)
         OVER (ORDER BY occurred_at, id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::text AS running_cents,
       received_at - occurred_at > interval '1 minute' AS out_of_order
     FROM payment_events
     WHERE document_id = $1
     ORDER BY occurred_at, id`,
    [documentId],
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function recordEvent(
  workspaceId: string,
  documentId: string,
  kind: string,
  blockId: string | null = null,
  detail: Record<string, unknown> = {},
) {
  return query(
    `INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [workspaceId, documentId, blockId, kind, JSON.stringify(detail)],
  );
}

/**
 * Records that a client opened the file, at most once.
 *
 * INSERT ... WHERE NOT EXISTS rather than a read followed by a write, so a page
 * rendered twice in the same second does not put two "opened" rows on a
 * timeline whose whole value is being a truthful account of what happened.
 */
export function recordFirstOpen(workspaceId: string, documentId: string) {
  return query(
    `INSERT INTO document_events (workspace_id, document_id, kind)
     SELECT $1, $2, 'opened'
      WHERE NOT EXISTS (
        SELECT 1 FROM document_events
         WHERE document_id = $2 AND kind = 'opened'
      )`,
    [workspaceId, documentId],
  );
}

export type TimelineEntry = {
  id: string;
  kind: string;
  block_id: string | null;
  detail: Record<string, unknown>;
  at: string;
  gap_seconds: string | null;
};

/**
 * One document's timeline, with the gap since the previous event.
 *
 * LAG over the same window is cheaper and more honest than computing gaps in
 * TypeScript, where a missing row silently becomes a wrong duration.
 */
export function timeline(documentId: string, limit = 200) {
  return query<TimelineEntry>(
    `SELECT
       id::text,
       kind,
       block_id,
       detail,
       at,
       EXTRACT(EPOCH FROM (at - LAG(at) OVER (ORDER BY at, id)))::bigint::text AS gap_seconds
     FROM document_events
     WHERE document_id = $1
     ORDER BY at, id
     LIMIT $2`,
    [documentId, limit],
  );
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export type MonthlyRevenue = {
  month: string;
  revenue_cents: string;
  running_cents: string;
  prev_cents: string | null;
  change_bps: string | null;
};

/**
 * Revenue by month, with a running total and the change on the month before.
 *
 * Three window functions over one scan. Doing this in application code would
 * mean either three passes or a pile of index arithmetic, and the
 * period-over-period column is where that arithmetic usually goes wrong: the
 * first month has no previous month, and NULLIF keeps that as an absent value
 * rather than a division by zero.
 */
export function monthlyRevenue(workspaceId: string) {
  return query<MonthlyRevenue>(
    `WITH by_month AS (
       SELECT date_trunc('month', occurred_at) AS m,
              SUM(amount_cents)::bigint        AS revenue_cents
         FROM payment_events
        WHERE workspace_id = $1 AND kind = 'captured'
        GROUP BY 1
     )
     SELECT
       to_char(m, 'YYYY-MM') AS month,
       revenue_cents::text,
       SUM(revenue_cents) OVER (ORDER BY m)::text AS running_cents,
       LAG(revenue_cents) OVER (ORDER BY m)::text AS prev_cents,
       (
         (revenue_cents - LAG(revenue_cents) OVER (ORDER BY m)) * 10000
         / NULLIF(LAG(revenue_cents) OVER (ORDER BY m), 0)
       )::text AS change_bps
     FROM by_month
     ORDER BY m`,
    [workspaceId],
  );
}

export type ServiceRanking = {
  option_id: string;
  name: string;
  times_chosen: string;
  revenue_cents: string;
  rank: string;
  share_bps: string;
};

/**
 * Which services actually sell, ranked by the revenue they represent.
 *
 * The join is the interesting part: the price of an option lives inside the
 * document's jsonb block tree, so this cross-references a relational selection
 * against a document-shaped catalogue with jsonb_array_elements in a LATERAL
 * join. It is exactly the case for keeping the definition as a document and the
 * behaviour as rows, and it is still one query.
 */
export function serviceRanking(workspaceId: string) {
  return query<ServiceRanking>(
    `WITH chosen AS (
       SELECT
         s.option_id,
         opt->>'name'                                   AS name,
         s.qty,
         (opt->>'priceCents')::bigint * s.qty           AS line_cents
       FROM selections s
       JOIN documents d ON d.id = s.document_id
       CROSS JOIN LATERAL jsonb_array_elements(d.doc->'blocks') AS block
       CROSS JOIN LATERAL jsonb_array_elements(block->'services'->'options') AS opt
       WHERE s.workspace_id = $1
         AND block->>'id' = s.block_id
         AND opt->>'id'   = s.option_id
     ),
     totals AS (
       SELECT option_id,
              MIN(name)             AS name,
              COUNT(*)::bigint      AS times_chosen,
              SUM(line_cents)::bigint AS revenue_cents
         FROM chosen
        GROUP BY option_id
     )
     SELECT
       option_id,
       name,
       times_chosen::text,
       revenue_cents::text,
       RANK() OVER (ORDER BY revenue_cents DESC)::text AS rank,
       (revenue_cents * 10000 / NULLIF(SUM(revenue_cents) OVER (), 0))::text AS share_bps
     FROM totals
     ORDER BY revenue_cents DESC`,
    [workspaceId],
  );
}

export type FunnelStep = { step: string; n: string; of_sent_bps: string };

/**
 * The funnel: sent, opened, selected, signed, paid.
 *
 * Counted with FILTER rather than five separate queries, so every step is
 * measured against the same snapshot. Five queries against a live table can
 * report more signatures than files, which is the kind of number that destroys
 * trust in a dashboard.
 */
export function funnel(workspaceId: string) {
  return query<FunnelStep>(
    `WITH per_doc AS (
       SELECT
         d.id,
         EXISTS (SELECT 1 FROM document_events e WHERE e.document_id = d.id AND e.kind = 'opened') AS opened,
         EXISTS (SELECT 1 FROM selections s      WHERE s.document_id = d.id)                        AS selected,
         EXISTS (SELECT 1 FROM signatures g      WHERE g.document_id = d.id)                        AS signed,
         EXISTS (SELECT 1 FROM payment_events p  WHERE p.document_id = d.id AND p.kind = 'captured') AS paid
       FROM documents d
       WHERE d.workspace_id = $1
     ),
     counted AS (
       SELECT
         count(*)::bigint                             AS sent,
         count(*) FILTER (WHERE opened)::bigint       AS opened,
         count(*) FILTER (WHERE selected)::bigint     AS selected,
         count(*) FILTER (WHERE signed)::bigint       AS signed,
         count(*) FILTER (WHERE paid)::bigint         AS paid
       FROM per_doc
     )
     SELECT step, n::text, (n * 10000 / NULLIF(sent, 0))::text AS of_sent_bps
     FROM counted, LATERAL (VALUES
       ('sent', sent), ('opened', opened), ('selected', selected),
       ('signed', signed), ('paid', paid)
     ) AS t(step, n)`,
    [workspaceId],
  );
}

export type TimeToSign = {
  median_hours: string | null;
  p90_hours: string | null;
  n: string;
};

/**
 * How long clients take to sign, as a median and a 90th percentile.
 *
 * A mean would be the easy thing to compute and the wrong thing to report: one
 * client who signed after three weeks drags it somewhere no real client has
 * ever been. percentile_cont is an ordered-set aggregate, which is the sort of
 * thing that is one line in SQL and an afternoon anywhere else.
 */
export function timeToSign(workspaceId: string) {
  return queryOne<TimeToSign>(
    `SELECT
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY hours))::numeric(10,1)::text AS median_hours,
       (percentile_cont(0.9) WITHIN GROUP (ORDER BY hours))::numeric(10,1)::text AS p90_hours,
       count(*)::text AS n
     FROM (
       SELECT EXTRACT(EPOCH FROM (g.signed_at - d.created_at)) / 3600.0 AS hours
         FROM signatures g
         JOIN documents d ON d.id = g.document_id
        WHERE g.workspace_id = $1
     ) s`,
    [workspaceId],
  );
}

// ---------------------------------------------------------------------------
// Composite writes
// ---------------------------------------------------------------------------

/**
 * Signs a contract and records the event together.
 *
 * In one transaction because the timeline is what the console shows, and a
 * signature that exists without the event that announced it would make the
 * console quietly wrong rather than loudly broken.
 */
export function signAndRecord(
  workspaceId: string,
  documentId: string,
  blockId: string,
  name: string,
) {
  return transaction(async (tx) => {
    const res = await tx.query<{ block_id: string }>(
      `INSERT INTO signatures (workspace_id, document_id, block_id, signed_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (document_id, block_id) DO NOTHING
       RETURNING block_id`,
      [workspaceId, documentId, blockId, name],
    );
    if (res.rows.length === 0) return { applied: false };

    await tx.query(
      `INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail)
       VALUES ($1, $2, $3, 'signed', $4::jsonb)`,
      [workspaceId, documentId, blockId, JSON.stringify({ name })],
    );
    return { applied: true };
  });
}
