import "server-only";

import type { ClientState, Resolved, SmartFileDoc, Validation } from "./engine.ts";

/**
 * Calling the rules engine.
 *
 * Split from ./engine.ts because that module carries the types and the money
 * formatter, both of which client components need, and this one reaches for
 * `node:fs` through the WASM loader. A bundler traces a dynamic import as
 * eagerly as a static one, so the split is a real boundary rather than a
 * stylistic one.
 */

/**
 * Where the HTTP engine lives.
 *
 * In development it is a separate Go process on 4310 (`npm run dev` starts
 * both). In production it is a Vercel Function in the same deployment, reached
 * by absolute URL because a server component has no origin of its own.
 *
 * The production path is a function calling another function, which is a real
 * cost: an extra invocation and an extra cold start on a plan metered by CPU.
 * It buys the thing that makes the split worth having, which is that the rules
 * are a compiled, separately tested artifact rather than more TypeScript.
 */
function engineUrl(): string {
  if (process.env.ENGINE_URL) return process.env.ENGINE_URL;

  // VERCEL_PROJECT_PRODUCTION_URL, not VERCEL_URL. VERCEL_URL is the
  // deployment-specific host, and deployment protection puts an SSO wall in
  // front of it, so a server component fetching its own function there gets a
  // 401 and the page 500s. The production alias is public.
  //
  // This is the sharpest edge of a function calling another function over HTTP,
  // and it only appears in production: locally and on the alias it works, on a
  // protected preview it does not.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) return `https://${host}/api/engine`;

  return "http://127.0.0.1:4310/api/engine";
}

/**
 * Lets a protected preview deployment call its own engine.
 *
 * Vercel injects this secret into protected deployments precisely so automated
 * traffic can get past the SSO wall. Without it a preview would have to borrow
 * production's engine, which is wrong the moment the engine is what changed.
 */
function bypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

export class EngineError extends Error {}

/**
 * Which transport reaches the engine.
 *
 * `wasm` is the default and calls the same Go code in-process. `http` is the
 * Vercel Function, kept because it is a real deployed surface anyone can curl
 * and because CI proves the two answer identically. `ENGINE_MODE` forces
 * either, which is what makes that comparison possible.
 *
 * WASM is the default for two reasons. It removes an invocation per render on a
 * plan metered by CPU, and it removes the one failure only production could
 * produce: a server component fetching its own function has to name a host, and
 * the deployment-specific host sits behind Vercel's SSO wall.
 */
function transport(): "wasm" | "http" {
  const mode = process.env.ENGINE_MODE;
  if (mode === "wasm" || mode === "http") return mode;
  // An explicit ENGINE_URL means somebody is pointing this at a running engine
  // on purpose, so honour it rather than quietly ignoring it.
  if (process.env.ENGINE_URL) return "http";
  return "wasm";
}

async function call<T>(body: unknown): Promise<T> {
  if (transport() === "wasm") {
    try {
      const { callWasm } = await import("./engine-wasm.ts");
      return await callWasm<T>(body);
    } catch (cause) {
      throw new EngineError(
        `The WASM engine failed to answer. Rebuild it with \`npm run build:wasm\`, or set ENGINE_MODE=http to use the deployed function instead.`,
        { cause },
      );
    }
  }
  return callHttp<T>(body);
}

async function callHttp<T>(body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(engineUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", ...bypassHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (cause) {
    // The most common cause by far is running `next dev` without the engine.
    // Say so, rather than surfacing a bare fetch failure.
    throw new EngineError(
      `Could not reach the rules engine at ${engineUrl()}. In development, run \`npm run dev\`, which starts it alongside Next.`,
      { cause },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EngineError(`Rules engine returned ${res.status}. ${detail}`.trim());
  }
  return (await res.json()) as T;
}

/** What this client is allowed to see and do right now. */
export function resolveDocument(
  document: SmartFileDoc,
  state: ClientState,
): Promise<Resolved> {
  return call<Resolved>({ op: "resolve", document, state });
}

/** Whether this document can be completed at all, and if not, why. */
export function validateDocument(document: SmartFileDoc): Promise<Validation> {
  return call<Validation>({ op: "validate", document });
}
