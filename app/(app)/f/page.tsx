import { redirect } from "next/navigation";

import * as db from "@/lib/db/queries";
import { currentWorkspace } from "@/lib/workspace";

/**
 * The way in.
 *
 * A client normally arrives on a link somebody sent them, so there is no index
 * of smart files in the real product and there should not be one here. What
 * this does instead is pick the furthest-back file in your workspace that
 * nobody has started yet and hand you its link, so /f is "show me the demo"
 * rather than a directory.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const workspace = await currentWorkspace();
  const { rows } = await db.documentSummaries(workspace);

  const untouched = rows.filter((r) => r.stage === "sent" || r.stage === "opened");
  const target = untouched.at(-1) ?? rows.at(-1);

  if (!target) redirect("/console");
  redirect(`/f/${target.token}`);
}
