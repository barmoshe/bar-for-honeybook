"use server";

import { redirect } from "next/navigation";

import * as db from "@/lib/db/queries";
import type { SmartFileDoc, Validation } from "@/lib/engine";
import { validateDocument } from "@/lib/engine-server";
import { parseBrief } from "@/lib/parser";
import { currentWorkspace } from "@/lib/workspace";

/**
 * Asks the Go engine whether a draft can be completed.
 *
 * The studio parses on the client, because a parser with no model behind it is
 * instant and there is nothing to hide. It validates on the server, because
 * validation is the engine's job and the engine is the compiled artifact this
 * whole split exists to keep authoritative. Two different questions, two
 * different places to answer them.
 */
export async function validateDraft(document: SmartFileDoc): Promise<Validation> {
  return validateDocument(document);
}

/**
 * Turns a draft into a real file with a client link.
 *
 * Re-parses the brief on the server rather than trusting the document the
 * browser sends. The client's copy is a preview; this is the one that gets
 * saved, so a hand-edited payload cannot write a document the parser would
 * never have produced.
 */
export async function createFile(
  brief: string,
  meta: { business: string; client: string },
): Promise<{ ok: false; error: string }> {
  const workspace = await currentWorkspace();

  const id = `${workspace}-new-${crypto.randomUUID().slice(0, 8)}`;
  const token = crypto.randomUUID().replaceAll("-", "");

  const derivation = parseBrief(brief, {
    id,
    token,
    business: meta.business.trim().slice(0, 80) || "Northlight Studio",
    client: meta.client.trim().slice(0, 80) || "Your client",
  });

  if (!derivation.document) {
    return { ok: false, error: derivation.problems[0] ?? "That brief did not produce a file." };
  }

  const validation = await validateDocument(derivation.document);
  if (!validation.ok) {
    const first = validation.problems.find((p) => p.severity === "error");
    return { ok: false, error: first?.message ?? "That file would not work." };
  }

  await db.insertDocument(workspace, derivation.document, token);
  await db.recordEvent(workspace, derivation.document.id, "created", null, {
    title: derivation.document.title,
    from: "studio",
  });

  redirect(`/f/${token}`);
}
