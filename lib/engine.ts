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
 *
 * Client components import this, so it stays free of anything Node-only.
 * Actually calling the engine lives in ./engine-server.ts: a bundler traces a
 * dynamic import as eagerly as a static one, so `node:fs` reachable from here
 * would end up in the browser bundle and fail the build. It did.
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

// ---------------------------------------------------------------------------
// Automations. Mirrors engine/automation.go the same way the types above mirror
// the rest of that package.
// ---------------------------------------------------------------------------

export type TriggerKind = "opened" | "selected" | "signed" | "paid";
export type StepKind = "wait" | "email" | "task" | "stage" | "condition";

export type Condition = {
  fact: "signed" | "paid" | "complete" | "total" | "balance";
  op: "is" | "not" | "gt" | "lt";
  value: string;
};

export type Step = {
  kind: StepKind;
  waitHours?: number;
  subject?: string;
  body?: string;
  title?: string;
  stage?: string;
  if?: Condition;
};

export type Automation = {
  id: string;
  name: string;
  trigger: TriggerKind;
  steps: Step[];
};

export type Facts = {
  signed: boolean;
  paid: boolean;
  complete: boolean;
  totalCents: number;
  balanceCents: number;
  client: string;
  business: string;
  title: string;
  currency: string;
};

export type RunStatus = "waiting" | "done" | "stopped";

export type AutomationAction = {
  stepIndex: number;
  kind: StepKind;
  subject?: string;
  body?: string;
  title?: string;
  stage?: string;
};

export type Advanced = {
  cursor: number;
  status: RunStatus;
  resumeAt?: string;
  actions: AutomationAction[];
  note?: string;
};

/**
 * What one pass of the runner did.
 *
 * Declared here rather than beside the runner because a client component shows
 * it, and importing even a *type* from a `server-only` module into the client
 * bundle stops that component hydrating: the buttons render, nothing is bound
 * to them, and there is no error to read. Types are cheap to move and that
 * failure is expensive to find.
 */
export type TickResult = {
  claimed: number;
  advanced: number;
  actions: number;
  asOf: string;
};

/** Formats integer cents the same way the engine does in signable prose. */
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
