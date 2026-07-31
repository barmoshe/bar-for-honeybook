"use server";

import { revalidatePath } from "next/cache";

import { resolveDocument } from "@/lib/engine";
import * as db from "@/lib/db/queries";

/**
 * Everything a client can do to a smart file.
 *
 * The rule every action here follows: ask the engine what is allowed *before*
 * writing, never after. The UI already knows a locked block is locked, but the
 * UI is a suggestion. These functions are the thing that actually refuses, and
 * they refuse by calling the same pure function the page rendered from, so
 * there is no second copy of the rules to keep in agreement.
 */

type Result = { ok: true } | { ok: false; error: string };

const OK: Result = { ok: true };
const deny = (error: string): Result => ({ ok: false, error });

/**
 * Loads the document and asks the engine for the current truth.
 *
 * Every action starts here, so no action can act on a stale view of the file.
 */
async function load(token: string) {
  const doc = await db.documentByToken(token);
  if (!doc) return null;
  const state = await db.clientState(doc.id);
  const resolved = await resolveDocument(doc.doc, state);
  return { doc, state, resolved };
}

function blockStatus(
  resolved: Awaited<ReturnType<typeof load>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof load>>>["resolved"],
  blockId: string,
) {
  return resolved.blocks.find((b) => b.id === blockId);
}

export async function toggleService(
  token: string,
  blockId: string,
  optionId: string,
  qty: number,
): Promise<Result> {
  const loaded = await load(token);
  if (!loaded) return deny("That link does not point at a file.");
  const { doc, resolved } = loaded;

  const block = blockStatus(resolved, blockId);
  if (!block) return deny("That block is not in this file.");
  if (block.status === "locked") return deny(block.lockReason ?? "That step is locked.");
  if (block.kind !== "services") return deny("That block does not take a selection.");

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

  revalidatePath(`/f/${token}`);
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

  const loaded = await load(token);
  if (!loaded) return deny("That link does not point at a file.");
  const { doc, resolved } = loaded;

  const block = blockStatus(resolved, blockId);
  if (!block) return deny("That block is not in this file.");
  if (block.status === "locked") return deny(block.lockReason ?? "That step is locked.");
  if (block.kind !== "contract") return deny("That block is not a contract.");

  // The signature and the event that announces it go in together, because a
  // console showing a paid file with no signature in its timeline is worse than
  // one that is loudly broken.
  const { applied } = await db.signAndRecord(doc.workspace_id, doc.id, blockId, trimmed);
  if (!applied) return deny("This has already been signed.");

  revalidatePath(`/f/${token}`);
  return OK;
}

/**
 * Takes a payment.
 *
 * Two things are load-bearing here, and both are the point of the demo.
 *
 * The gate: this reads the invoice block's status from the engine and refuses
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
  const loaded = await load(token);
  if (!loaded) return deny("That link does not point at a file.");
  const { doc, state, resolved } = loaded;

  const block = blockStatus(resolved, blockId);
  if (!block) return deny("That block is not in this file.");
  if (block.kind !== "invoice") return deny("That block does not take a payment.");
  if (block.status === "locked") {
    return deny(block.lockReason ?? "Payment is not open yet.");
  }

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

  revalidatePath(`/f/${token}`);
  // A replay is not an error from the client's point of view. They pressed the
  // button, the money is where they expect it, and telling them off for a
  // double click would be the software's problem leaking into their day.
  return OK;
}

export async function answerQuestion(
  token: string,
  blockId: string,
  questionId: string,
  answer: string,
): Promise<Result> {
  const loaded = await load(token);
  if (!loaded) return deny("That link does not point at a file.");
  const { doc, resolved } = loaded;

  const block = blockStatus(resolved, blockId);
  if (!block) return deny("That block is not in this file.");
  if (block.status === "locked") return deny(block.lockReason ?? "That step is locked.");
  if (block.kind !== "questionnaire") return deny("That block does not take answers.");

  await db.upsertAnswer(doc.workspace_id, doc.id, blockId, questionId, answer.slice(0, 2000));
  revalidatePath(`/f/${token}`);
  return OK;
}

export async function bookSlot(
  token: string,
  blockId: string,
  slotId: string,
): Promise<Result> {
  const loaded = await load(token);
  if (!loaded) return deny("That link does not point at a file.");
  const { doc, resolved } = loaded;

  const block = blockStatus(resolved, blockId);
  if (!block) return deny("That block is not in this file.");
  if (block.status === "locked") return deny(block.lockReason ?? "That step is locked.");
  if (block.kind !== "scheduler") return deny("That block does not take a booking.");

  await db.upsertBooking(doc.workspace_id, doc.id, blockId, slotId);
  await db.recordEvent(doc.workspace_id, doc.id, "booked", blockId, { slotId });

  revalidatePath(`/f/${token}`);
  return OK;
}
