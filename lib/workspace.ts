import "server-only";

import { cookies } from "next/headers";
import { ensureWorkspace } from "./db/client.ts";

export const WORKSPACE_COOKIE = "hb_ws";

/**
 * Returns this visitor's workspace id, creating and seeding the workspace on
 * first use.
 *
 * The proxy has already minted the cookie, so the only job left is making the
 * rows exist. ensureWorkspace is a no-op on every call after the first, which
 * matters because this runs on every request a warm instance serves.
 *
 * The cold-start behaviour is the honest part of the demo: the database lives
 * in the function instance, so a returning visitor whose instance has recycled
 * gets a freshly seeded workspace under the same id. Their history comes back
 * looking identical, because the seed is deterministic, and anything they
 * signed themselves does not. The site says so where it matters.
 */
export async function currentWorkspace(): Promise<string> {
  const jar = await cookies();
  const id = jar.get(WORKSPACE_COOKIE)?.value;

  if (!id) {
    // Only reachable if a route outside the middleware matcher calls this.
    throw new Error(
      `No ${WORKSPACE_COOKIE} cookie. Add the route to the matcher in proxy.ts.`,
    );
  }

  await ensureWorkspace(id);
  return id;
}
