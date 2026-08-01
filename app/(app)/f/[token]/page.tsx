import type { Metadata } from "next";
import { notFound } from "next/navigation";

import * as db from "@/lib/db/queries";
import { resolveDocument } from "@/lib/engine-server";
import { currentWorkspace } from "@/lib/workspace";

import SmartFileView from "./SmartFileView";

// Every read here depends on what this particular client has already done, so
// there is nothing to cache and pretending otherwise would show someone else's
// progress.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart file",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Seeds this visitor's workspace if the instance is cold. Note the file
  // itself is looked up by token rather than by workspace: a client link is
  // meant to open for whoever holds it, with no account and no login, which is
  // the entire point of the format.
  await currentWorkspace();

  const row = await db.documentByToken(token);
  if (!row) notFound();

  await db.recordFirstOpen(row.workspace_id, row.id);

  const state = await db.clientState(row.id);
  const resolved = await resolveDocument(row.doc, state);

  return <SmartFileView token={token} doc={row.doc} resolved={resolved} />;
}
