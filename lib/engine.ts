/**
 * The TypeScript side of the rules engine boundary.
 *
 * The engine itself is Go (see ../engine). These types mirror the JSON tags on
 * its structs, which are the actual contract between the two languages. They
 * are hand-written rather than generated: the surface is small, and a codegen
 * step is a thing that breaks on someone else's machine.
 *
 * Nothing in here decides anything. If you find yourself about to write a rule
 * on this side of the boundary, it belongs in the Go package, where it has
 * tests.
 */

export type BlockKind =
  | "services"
  | "contract"
  | "invoice"
  | "questionnaire"
  | "scheduler";

export type SelectionMode = "single" | "multi";
export type BlockStatus = "locked" | "open" | "complete";
export type Severity = "error" | "warning";

export type ServiceOption = {
  id: string;
  name: string;
  blurb?: string;
  priceCents: number;
  maxQty?: number;
};

export type Question = {
  id: string;
  prompt: string;
  kind: "text" | "choice";
  options?: string[];
  required: boolean;
};

export type Slot = { id: string; startsAt: string; durationMin: number };

export type Block = {
  id: string;
  kind: BlockKind;
  title: string;
  required: boolean;
  requiresComplete?: string[];
  services?: { mode: SelectionMode; options: ServiceOption[] };
  contract?: { body: string; signatureRequired: boolean };
  invoice?: { depositBps: number; taxBps: number };
  questionnaire?: { questions: Question[] };
  scheduler?: { slots: Slot[] };
};

export type SmartFileDoc = {
  id: string;
  title: string;
  business: string;
  client: string;
  currency: string;
  blocks: Block[];
};

export type Pick = { optionId: string; qty?: number };

export type ClientState = {
  selections?: Record<string, Pick[]>;
  answers?: Record<string, Record<string, string>>;
  signed?: Record<string, string>;
  booked?: Record<string, string>;
  paidCents?: number;
};

export type Totals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositDueCents: number;
  paidCents: number;
  dueNowCents: number;
  balanceCents: number;
};

export type InvoiceLine = {
  label: string;
  qty: number;
  unitCents: number;
  amountCents: number;
};

export type ResolvedBlock = {
  id: string;
  kind: BlockKind;
  title: string;
  status: BlockStatus;
  lockedBy?: string[];
  lockReason?: string;
  services?: {
    mode: SelectionMode;
    selected: number;
    options: (ServiceOption & { chosen: boolean; qty: number; lineCents: number })[];
  };
  contract?: {
    body: string;
    signatureRequired: boolean;
    signature?: string;
    signed: boolean;
  };
  invoice?: { lines: InvoiceLine[] } & Totals;
  questionnaire?: { questions: (Question & { answer?: string })[] };
  scheduler?: { slots: Slot[]; booked?: string };
};

export type NextAction = {
  blockId: string;
  kind: BlockKind;
  verb: "select" | "sign" | "pay" | "answer" | "book";
  label: string;
};

export type Resolved = {
  documentId: string;
  currency: string;
  blocks: ResolvedBlock[];
  totals: Totals;
  next?: NextAction;
  complete: boolean;
};

export type Problem = {
  code: string;
  severity: Severity;
  blockId?: string;
  dependsOn?: string;
  message: string;
};

export type Validation = { ok: boolean; problems: Problem[]; order?: string[] };

/**
 * Where the engine lives.
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
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/engine`;
  return "http://127.0.0.1:4310/api/engine";
}

export class EngineError extends Error {}

async function call<T>(body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(engineUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
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

/** Formats integer cents the same way the engine does in contract prose. */
export function money(cents: number, currency = "USD"): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    ILS: "₪",
  };
  const symbol = symbols[currency.toUpperCase()] ?? "";
  const suffix = symbol ? "" : ` ${currency.toUpperCase()}`;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const body = `${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${symbol}${body}${suffix}`;
}
