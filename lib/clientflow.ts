import "server-only";

import * as db from "./db/queries.ts";
import { resolveDocument } from "./engine.ts";

/**
 * Everything a client can do to a smart file, and the gate that decides whether
 * they may.
 *
 * This lives here rather than in the server-action file for one reason worth
 * stating: the action file calls `revalidatePath`, which only works inside a
 * Next request, so the load-bearing security boundary of the whole demo could
 * not be tested without mocking the framework. The rule every function below
 * follows is the interesting part, and a rule you cannot test is a hope.
 *
 * The rule: **ask the engine what is allowed before writing, never after.** The
 * UI already knows a locked block is locked, but the UI is a suggestion. These
 * functions are the thing that actually refuses, and they refuse by calling the
 * same pure function the page rendered from, so there is no second copy of the
 * rules to keep in agreement.
 *
 * `scripts/prove-actions.mjs` drives every one of them against a real database.
 */

export type Result = { ok: true } | { ok: false; error: string };

export const OK: Result = { ok: true };
export const deny = (error: string): Result => ({ ok: false, error });

/**
 * Loads the document and asks the engine for the current truth.
 *
 * Every operation starts here, so none can act on a stale view of the file.
 */
async function load(token: string) {
  const doc = await db.documentByToken(token);
  if (!doc) return null;
  const state = await db.clientState(doc.id);
  const resolved = await resolveDocument(doc.doc, state);
  return { doc, state, resolved };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

/**
 * The gate, in one place.
 *
 * Resolves the file, finds the block, and refuses unless it exists, is of the
 * kind the caller expects, and is not locked. Returning the loaded state means
 * a caller cannot accidentally re-read it and act on a different answer than
 * the one it was cleared against.
 */
async function open(
  token: string,
  blockId: string,
  kind: string,
  notThisKind: string,
): Promise<{ ok: true; loaded: Loaded; block: Loaded["resolved"]["blocks"][number] } | { ok: false; error: string }> {
  const loaded = await load(token);
  if (!loaded) return { ok: false, error: "That link does not point at a file." };

  const block = loaded.resolved.blocks.find((b) => b.id === blockId);
  if (!block) return { ok: false, error: "That block is not in this file." };
  if (block.kind !== kind) return { ok: false, error: notThisKind };
  if (block.status === "locked") {
    return { ok: false, error: block.lockReason ?? "That step is not open yet." };
  }

  return { ok: true, loaded, block };
}

export async function toggleService(
  token: string,
  blockId: string,
  optionId: string,
  qty: number,
): Promise<Result> {
  const gate = await open(token, blockId, "services", "That block does not take a selection.");
  if (!gate.ok) return deny(gate.error);
  const { loaded, block } = gate;
  const { doc } = loaded;

  // Single-select blocks clear the block before writing, so the invariant lives
  // in the database rather than only in the engine's tie-breaking.
  if (qty > 0 && block.services?.mode === "single") {
    await db.clearBlockSelections(doc.id, blockId);
  }

  if (qty > 0) {
    await db.setSelection(doc.workspace_id, doc.id, blockId, optionId, qty);
  } else {
    await db.clearSelection(doc.id, blockId, optionId);
  }

  await db.recordEvent(doc.workspace_id, doc.id, qty > 0 ? "selected" : "deselected", blockId, {
    optionId,
    qty,
  });

  return OK;
}

export async function signContract(
  token: string,
  blockId: string,
  name: string,
): Promise<Result> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return deny("Type your full name to sign.");
  if (trimmed.length > 120) return deny("That name is too long.");

  const gate = await open(token, blockId, "contract", "That block is not a contract.");
  if (!gate.ok) return deny(gate.error);
  const { doc } = gate.loaded;

  // The signature and the event that announces it go in together, because a
  // console showing a paid file with no signature in its timeline is worse than
  // one that is loudly broken.
  const { applied } = await db.signAndRecord(doc.workspace_id, doc.id, blockId, trimmed);
  if (!applied) return deny("This has already been signed.");

  return OK;
}

/**
 * Takes a payment.
 *
 * Two things are load-bearing here, and both are the point of the demo.
 *
 * The gate: `open` reads the invoice block's status from the engine and refuses
 * when it is locked. That is what makes "the invoice is unreachable until the
 * contract is signed" a fact about the system rather than a claim about the UI.
 * Withholding the payload from the page is not enough on its own, because a
 * page is not the only thing that can call a server action.
 *
 * The idempotency key: it encodes the balance this payment moves *from*, so two
 * clicks a few milliseconds apart produce the same key and the unique index
 * settles which one happened. No lock, no read-then-write, no double charge.
 */
export async function payNow(token: string, blockId: string): Promise<Result> {
  const gate = await open(token, blockId, "invoice", "That block does not take a payment.");
  if (!gate.ok) return deny(gate.error);
  const { doc, state, resolved } = gate.loaded;

  const due = resolved.totals.dueNowCents;
  if (due <= 0) return deny("There is nothing left to pay.");

  const paidBefore = state.paidCents ?? 0;
  const key = `${doc.id}:pay:${paidBefore}`;

  const { applied } = await db.capturePayment(doc.workspace_id, doc.id, key, due);
  if (applied) {
    await db.recordEvent(doc.workspace_id, doc.id, "paid", blockId, {
      amountCents: due,
      idempotencyKey: key,
    });
  }

  // A replay is not an error from the client's point of view. They pressed the
  // button, the money is where they expect it, and telling them off for a double
  // click would be the software's problem leaking into their day.
  return OK;
}

export async function answerQuestion(
  token: string,
  blockId: string,
  questionId: string,
  answer: string,
): Promise<Result> {
  const gate = await open(token, blockId, "questionnaire", "That block does not take answers.");
  if (!gate.ok) return deny(gate.error);
  const { doc } = gate.loaded;

  await db.upsertAnswer(doc.workspace_id, doc.id, blockId, questionId, answer.slice(0, 2000));
  return OK;
}

export async function bookSlot(
  token: string,
  blockId: string,
  slotId: string,
): Promise<Result> {
  const gate = await open(token, blockId, "scheduler", "That block does not take a booking.");
  if (!gate.ok) return deny(gate.error);
  const { doc } = gate.loaded;

  await db.upsertBooking(doc.workspace_id, doc.id, blockId, slotId);
  await db.recordEvent(doc.workspace_id, doc.id, "booked", blockId, { slotId });

  return OK;
}
