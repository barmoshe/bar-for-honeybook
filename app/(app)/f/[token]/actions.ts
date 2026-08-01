"use server";

import { revalidatePath } from "next/cache";

import * as flow from "@/lib/clientflow";

/**
 * The server-action surface for a smart file.
 *
 * Deliberately thin. Every decision lives in `lib/clientflow.ts`, which knows
 * nothing about Next and can therefore be driven by `npm run prove:actions`
 * against a real database. What is left here is the one thing that genuinely
 * belongs to the framework: telling it the page is stale.
 *
 * The split exists because the gate is the load-bearing claim of the whole
 * demo. A rule that can only run inside a request is a rule nothing can check.
 */

type Result = { ok: true } | { ok: false; error: string };

/** Revalidate on success only: a refused action changed nothing to show. */
function done(token: string, result: Result): Result {
  if (result.ok) revalidatePath(`/f/${token}`);
  return result;
}

export async function toggleService(
  token: string,
  blockId: string,
  optionId: string,
  qty: number,
): Promise<Result> {
  return done(token, await flow.toggleService(token, blockId, optionId, qty));
}

export async function signContract(
  token: string,
  blockId: string,
  name: string,
): Promise<Result> {
  return done(token, await flow.signContract(token, blockId, name));
}

export async function payNow(token: string, blockId: string): Promise<Result> {
  return done(token, await flow.payNow(token, blockId));
}

export async function answerQuestion(
  token: string,
  blockId: string,
  questionId: string,
  answer: string,
): Promise<Result> {
  return done(token, await flow.answerQuestion(token, blockId, questionId, answer));
}

export async function bookSlot(
  token: string,
  blockId: string,
  slotId: string,
): Promise<Result> {
  return done(token, await flow.bookSlot(token, blockId, slotId));
}
