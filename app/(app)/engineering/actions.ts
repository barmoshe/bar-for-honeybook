"use server";

import * as db from "@/lib/db/queries";
import { currentWorkspace } from "@/lib/workspace";

export type ReplayResult = {
  key: string;
  beforeCents: number;
  afterCents: number;
  applied: boolean;
  entries: number;
  note: string;
};

/**
 * Replays a payment that has already happened, with the key it already used.
 *
 * This is the idempotency claim, run live rather than described. The unique
 * index on (workspace_id, idempotency_key) settles it inside Postgres: the
 * insert finds a conflict, does nothing, returns no row, and the balance is a
 * SUM over a table that did not change. There is no read-then-write here and so
 * no window in which two deliveries of one webhook both decide they are first.
 */
export async function replayPayment(documentId: string): Promise<ReplayResult> {
  const workspace = await currentWorkspace();

  const before = await db.clientState(documentId);
  const existing = await db.ledger(documentId);
  const key = existing.rows[0]?.idempotency_key ?? `${documentId}:deposit`;
  const amount = Number(existing.rows[0]?.amount_cents ?? 100000);

  const { applied } = await db.capturePayment(workspace, documentId, key, amount);

  const after = await db.clientState(documentId);
  const entries = await db.ledger(documentId);

  return {
    key,
    beforeCents: before.paidCents ?? 0,
    afterCents: after.paidCents ?? 0,
    applied,
    entries: entries.rows.length,
    note: applied
      ? "That key was new, so it was applied. Press it again."
      : "Conflict on the unique index. No row written, balance unmoved.",
  };
}

/**
 * Files the same payment again with a fresh key but an older occurred_at, which
 * is what a webhook redelivered out of order looks like.
 *
 * It lands, because it is genuinely a different event. The balance still comes
 * out right, because the balance is a SUM and addition does not care what order
 * it is done in. That is the whole reason this ledger is append-only instead of
 * a column somebody updates.
 */
export async function replayOutOfOrder(documentId: string): Promise<ReplayResult> {
  const workspace = await currentWorkspace();

  const before = await db.clientState(documentId);
  const key = `${documentId}:late:${Date.now()}`;
  const occurred = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);

  const { applied } = await db.capturePayment(workspace, documentId, key, 1000, occurred);

  const after = await db.clientState(documentId);
  const entries = await db.ledger(documentId);

  return {
    key,
    beforeCents: before.paidCents ?? 0,
    afterCents: after.paidCents ?? 0,
    applied,
    entries: entries.rows.length,
    note: "A different event, dated nine days ago. It sorts into place and the total is still right.",
  };
}
