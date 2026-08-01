"use server";

import { revalidatePath } from "next/cache";

import { tick } from "@/lib/automations";
import type { TickResult } from "@/lib/engine";
import { currentWorkspace } from "@/lib/workspace";

/**
 * Advances every run that is due, as of now plus `days`.
 *
 * The clock is a parameter rather than something the engine reads, which is
 * what makes this button honest. Pressing "jump forward three days" does not
 * fake a timestamp or shortcut a wait: it asks the same question the runner
 * asks on a page load, with a different `asOf`, and the Go function that
 * decides is the one the tests drive.
 *
 * A free plan has no background worker, so somebody has to ask. Saying so is
 * better than a cron nobody can see and a demo where nothing appears to happen.
 */
export async function advanceClock(days: number): Promise<TickResult> {
  const workspace = await currentWorkspace();

  const safe = Number.isFinite(days) ? Math.min(Math.max(days, 0), 365) : 0;
  const asOf = new Date(Date.now() + safe * 24 * 60 * 60 * 1000);

  const result = await tick(workspace, asOf);
  revalidatePath("/console/automations");
  revalidatePath("/console");
  return result;
}
