import type { Block, SmartFileDoc } from "./engine";

/**
 * Turns a plain-language brief into a smart file, and shows its working.
 *
 * The product this imitates does this with a model. This does it with rules, on
 * purpose, and says so on the page. Three reasons, in order of how much they
 * matter:
 *
 *  1. It is a public URL with no login. A model key behind one is an open
 *     wallet, and rate-limiting a demo is a worse use of an afternoon than
 *     writing the rules.
 *  2. The demo's whole claim is that the output is provably correct. A parser
 *     can show you exactly which words produced which block; a model can only
 *     be asked to explain itself afterwards.
 *  3. It runs in CI, offline, on a plane, with no spinner and no failure mode.
 *
 * The derivation is not decoration. Every finding carries the span of input
 * that produced it, so the UI can highlight the phrase and name the effect.
 * Anything left over is reported as unmatched rather than quietly dropped: a
 * parser that silently ignores half a sentence is worse than one that admits it.
 */

export type Span = { start: number; end: number; text: string };

export type Finding = {
  /** Which rule fired. Stable, so the UI can group and the tests can assert. */
  rule: string;
  /**
   * Every span that produced this finding.
   *
   * Usually one. But "intake questionnaire" trips the questionnaire rule twice,
   * and two identical rows saying "block: questionnaire" reads as a bug rather
   * than as two phrases agreeing. Collapsing them into one finding with two
   * spans keeps both phrases highlighted and the list honest.
   */
  spans: Span[];
  /** What it understood, in a person's words. */
  intent: string;
  /** What it did about it, in the document's words. */
  effect: string;
};

export type Edge = { from: string; to: string; because: string };

export type Derivation = {
  input: string;
  findings: Finding[];
  /** Runs of input that carry words but produced nothing. */
  unmatched: Span[];
  edges: Edge[];
  document: SmartFileDoc | null;
  /** Why there is no document, when there is no document. */
  problems: string[];
};

// ---------------------------------------------------------------------------
// What the rules accumulate into.
// ---------------------------------------------------------------------------

type Draft = {
  serviceName: string | null;
  serviceCount: number;
  multiSelect: boolean;
  prices: number[];
  addons: string[];
  wantsContract: boolean;
  signatureRequired: boolean;
  wantsInvoice: boolean;
  depositBps: number | null;
  taxBps: number | null;
  wantsQuestionnaire: boolean;
  wantsScheduler: boolean;
  gatePaymentBehindSignature: boolean;
  currency: string;
  title: string | null;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  single: 1, double: 2, triple: 3,
};

/**
 * Words that mean nothing on their own. Used only to decide whether a leftover
 * run of text is worth reporting as unmatched: "and then" is not a failure to
 * understand, "underwater welding" is.
 */
const FILLER = new Set([
  "a", "an", "and", "the", "then", "with", "for", "of", "to", "in", "on", "at",
  "or", "plus", "also", "some", "my", "our", "their", "i", "we", "want", "wants",
  "need", "needs", "should", "would", "like", "please", "it", "its", "this",
  "that", "them", "each", "per", "up", "front", "upfront", "after", "before",
  "first", "them", "is", "are", "be", "make", "made", "let", "lets", "client",
  "clients", "customer", "customers", "them", "so", "if", "when", "once",
]);

type Rule = {
  id: string;
  pattern: RegExp;
  /** Return null to decline the match after looking at the groups. */
  apply: (m: RegExpExecArray, draft: Draft) => { intent: string; effect: string } | null;
};

/**
 * Order is priority. Every rule scans the whole input, but a span already
 * claimed by an earlier rule is off limits, so the more specific pattern has to
 * come first or it never gets to fire.
 *
 * That is not a stylistic point. "contract before payment" is one statement
 * about ordering; `contract` and `payment` are two statements about content. If
 * the narrow rules run first they eat both words and the derivation reports the
 * weaker fact, which is how this list was ordered on the first attempt and what
 * driving it in a browser caught.
 *
 * Rules are otherwise written to be narrow. It is better to leave a phrase
 * unmatched and say so than to guess and be confidently wrong about a document
 * somebody is going to sign.
 */
const RULES: Rule[] = [
  {
    id: "deposit",
    pattern:
      /(\d{1,3})\s*(?:%|percent)\s*(?:deposit|up ?front|down|to book|to reserve)|(?:deposit|up ?front|down payment)\s*(?:of\s*)?(\d{1,3})\s*(?:%|percent)|\b(half|a half)\b\s*(?:up ?front|deposit|to book|to reserve)/gi,
    apply: (m, d) => {
      const pct = m[1] ?? m[2] ? Number(m[1] ?? m[2]) : 50;
      if (pct <= 0 || pct > 100) return null;
      d.depositBps = pct * 100;
      d.wantsInvoice = true;
      return {
        intent: `a deposit of ${pct}%`,
        effect: `invoice.depositBps = ${pct * 100}`,
      };
    },
  },
  {
    id: "tax",
    pattern: /(\d{1,2}(?:\.\d)?)\s*(?:%|percent)\s*(?:tax|vat|sales tax)|(?:tax|vat)\s*(?:of\s*)?(\d{1,2}(?:\.\d)?)\s*(?:%|percent)/gi,
    apply: (m, d) => {
      const pct = Number(m[1] ?? m[2]);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 99) return null;
      d.taxBps = Math.round(pct * 100);
      d.wantsInvoice = true;
      return { intent: `tax at ${pct}%`, effect: `invoice.taxBps = ${Math.round(pct * 100)}` };
    },
  },
  {
    id: "price",
    pattern: /([$€£₪])\s?(\d[\d,]*\d|\d)(?:\.(\d{2}))?/g,
    apply: (m, d) => {
      const symbol = m[1];
      const cents =
        Number(m[2].replaceAll(",", "")) * 100 + (m[3] ? Number(m[3]) : 0);
      if (!Number.isFinite(cents) || cents <= 0) return null;
      d.prices.push(cents);
      d.currency =
        symbol === "€" ? "EUR" : symbol === "£" ? "GBP" : symbol === "₪" ? "ILS" : "USD";
      d.wantsInvoice = true;
      return { intent: `a price of ${symbol}${m[2]}`, effect: `services.options[].priceCents = ${cents}` };
    },
  },
  {
    id: "tiers",
    pattern: /\b(one|two|three|four|five|six|single|double|triple|\d)\s+(tiers?|options?|packages?|levels?|choices?)\b/gi,
    apply: (m, d) => {
      const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
      if (!Number.isFinite(n) || n < 1 || n > 8) return null;
      d.serviceCount = n;
      d.multiSelect = false;
      return {
        intent: `${n} ${m[2].toLowerCase()} to choose between`,
        effect: `services.mode = "single", ${n} options`,
      };
    },
  },
  {
    id: "addons",
    pattern: /\b(add[- ]?ons?|extras?|optional extras?|upsells?)\b/gi,
    apply: (_m, d) => {
      d.multiSelect = true;
      d.addons.push("Add-on");
      return { intent: "optional extras", effect: `services.mode = "multi"` };
    },
  },
  {
    id: "gate",
    pattern:
      /\b(?:contract|agreement|terms|sign(?:ature|ed|ing)?)\b[^.;]{0,40}?\bbefore\b[^.;]{0,40}?\b(?:pay(?:ment|ing)?|invoice|deposit|charge)\b|\b(?:pay(?:ment|ing)?|invoice|deposit)\b[^.;]{0,40}?\bafter\b[^.;]{0,40}?\b(?:contract|agreement|terms|sign(?:ature|ed|ing)?)\b|\bno pay(?:ment)? (?:until|before)\b/gi,
    apply: (_m, d) => {
      d.gatePaymentBehindSignature = true;
      d.wantsContract = true;
      d.signatureRequired = true;
      d.wantsInvoice = true;
      return {
        intent: "payment waits for the signature",
        effect: "invoice.requiresComplete = [contract]",
      };
    },
  },
  {
    id: "service",
    pattern:
      /\b(photograph(?:y|er)|photo(?: shoot)?|video(?:graphy)?|design|branding|coaching|consult(?:ing|ation)|catering|planning|makeup|florals?|dj|music|tutoring|training|therapy|legal|copywriting|web(?: design)?)\b(?:\s+(package|session|shoot|day|retainer|service))?/gi,
    apply: (m, d) => {
      if (d.serviceName) return null; // first one wins; the rest are context
      const noun = m[1].toLowerCase();
      const pretty = noun.charAt(0).toUpperCase() + noun.slice(1);
      const suffix = m[2] ? ` ${m[2].toLowerCase()}` : " package";
      d.serviceName = pretty + suffix;
      d.title = d.serviceName;
      return { intent: `the work is ${noun}`, effect: `services.options[0].name = "${d.serviceName}"` };
    },
  },
  {
    id: "contract",
    pattern: /\b(contracts?|agreements?|terms(?: and conditions)?|t&cs?)\b/gi,
    apply: (_m, d) => {
      d.wantsContract = true;
      d.signatureRequired = true;
      return { intent: "an agreement to accept", effect: "block: contract, signatureRequired = true" };
    },
  },
  {
    id: "signature",
    pattern: /\b(signature|e[- ]?sign|sign(?:ed|ing)?)\b/gi,
    apply: (_m, d) => {
      d.wantsContract = true;
      d.signatureRequired = true;
      return { intent: "it has to be signed", effect: "contract.signatureRequired = true" };
    },
  },
  {
    id: "payment",
    pattern: /\b(invoices?|payments?|pay(?:ing)?|charge|checkout|billing)\b/gi,
    apply: (_m, d) => {
      d.wantsInvoice = true;
      return { intent: "money changes hands", effect: "block: invoice" };
    },
  },
  {
    id: "questionnaire",
    pattern: /\b(questionnaires?|questions?|intake(?: form)?|survey|brief(?:ing)? form|ask them)\b/gi,
    apply: (_m, d) => {
      d.wantsQuestionnaire = true;
      return { intent: "questions to answer", effect: "block: questionnaire" };
    },
  },
  {
    id: "scheduler",
    pattern: /\b(schedul(?:e|ing|er)|book(?:ing)? a? ?(?:call|time|slot|session)?|calendar|pick a time|meeting|discovery call)\b/gi,
    apply: (_m, d) => {
      d.wantsScheduler = true;
      return { intent: "a time to book", effect: "block: scheduler" };
    },
  },
];

// ---------------------------------------------------------------------------

const DEFAULT_PRICE_CENTS = 120000;

function emptyDraft(): Draft {
  return {
    serviceName: null,
    serviceCount: 1,
    multiSelect: false,
    prices: [],
    addons: [],
    wantsContract: false,
    signatureRequired: false,
    wantsInvoice: false,
    depositBps: null,
    taxBps: null,
    wantsQuestionnaire: false,
    wantsScheduler: false,
    gatePaymentBehindSignature: false,
    currency: "USD",
    title: null,
  };
}

/** Non-overlapping, first-come. Two rules matching the same words would show a
 *  derivation that contradicts itself. */
function overlaps(a: Span, taken: Span[]): boolean {
  return taken.some((t) => a.start < t.end && t.start < a.end);
}

export function parseBrief(
  input: string,
  opts: { business?: string; client?: string; id?: string; token?: string } = {},
): Derivation {
  const findings: Finding[] = [];
  const taken: Span[] = [];
  const draft = emptyDraft();

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(input)) !== null) {
      // Zero-length matches would spin forever; regexes here should not produce
      // them, but a defensive step is cheaper than a hung page.
      if (m[0].length === 0) {
        rule.pattern.lastIndex += 1;
        continue;
      }
      const span: Span = { start: m.index, end: m.index + m[0].length, text: m[0] };
      if (overlaps(span, taken)) continue;

      const outcome = rule.apply(m, draft);
      if (!outcome) continue;

      taken.push(span);

      // Same rule, same effect: one finding, two phrases.
      const existing = findings.find(
        (f) => f.rule === rule.id && f.effect === outcome.effect && f.intent === outcome.intent,
      );
      if (existing) existing.spans.push(span);
      else findings.push({ rule: rule.id, spans: [span], ...outcome });
    }
  }

  findings.sort((a, b) => a.spans[0].start - b.spans[0].start);
  taken.sort((a, b) => a.start - b.start);

  const unmatched = leftovers(input, taken);
  const { document, edges, problems } = assemble(draft, findings, input, opts);

  return { input, findings, unmatched, edges, document, problems };
}

/** Runs of input that no rule claimed and that contain a word worth noticing. */
function leftovers(input: string, taken: Span[]): Span[] {
  const out: Span[] = [];
  let cursor = 0;

  const consider = (start: number, end: number) => {
    const text = input.slice(start, end);
    const words = text.match(/[a-zA-Z][a-zA-Z'-]{1,}/g) ?? [];
    const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
    if (meaningful.length === 0) return;
    out.push({ start, end, text: text.trim() });
  };

  for (const span of taken) {
    if (span.start > cursor) consider(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < input.length) consider(cursor, input.length);

  return out;
}

function assemble(
  d: Draft,
  findings: Finding[],
  input: string,
  opts: { business?: string; client?: string; id?: string; token?: string },
): { document: SmartFileDoc | null; edges: Edge[]; problems: string[] } {
  const problems: string[] = [];

  if (findings.length === 0) {
    problems.push(
      "Nothing in that was recognised. Try naming what you sell, whether there is a contract, and how you take payment.",
    );
    return { document: null, edges: [], problems };
  }

  const blocks: Block[] = [];
  const edges: Edge[] = [];

  /** The nearest earlier block a new one should wait for. */
  const previous = (...preference: string[]): string | null =>
    preference.find((id) => blocks.some((b) => b.id === id)) ?? null;

  const gate = (id: string, on: string | null, because: string) => {
    if (!on) return undefined;
    edges.push({ from: id, to: on, because });
    return [on];
  };

  // A services block only exists if the brief implied one. A smart file whose
  // entire job is collecting a signature is a real and common shape, and
  // inventing a product to put above it would be the parser overruling the
  // person who wrote the brief.
  const sellsSomething =
    Boolean(d.serviceName) || d.prices.length > 0 || d.serviceCount > 1 || d.multiSelect || d.wantsInvoice;

  if (sellsSomething) {
    const serviceName = d.serviceName ?? "Your package";
    const basePrice = d.prices[0] ?? DEFAULT_PRICE_CENTS;
    if (d.prices.length === 0) {
      problems.push(
        `No price was given, so every option is a placeholder at ${(basePrice / 100).toFixed(0)}. Put a figure in the brief to set it.`,
      );
    }

    const options = [];
    const tierNames = [
      "Essential", "Signature", "Premier", "Collector",
      "Bespoke", "Reserve", "Atelier", "Grand",
    ];
    for (let i = 0; i < d.serviceCount; i++) {
      const price = d.prices[i] ?? Math.round(basePrice * (1 + i * 0.6));
      options.push({
        id: `svc_${i + 1}`,
        name: d.serviceCount > 1 ? `${serviceName}, ${tierNames[i]}` : serviceName,
        blurb: "Edit this in the studio.",
        priceCents: price,
      });
    }
    // One add-on option however many times the brief says "extras". Looping
    // over the mentions would emit several options sharing an id, which the
    // validator does not check and Resolve would happily charge for twice.
    if (d.addons.length > 0) {
      options.push({
        id: "addon_1",
        name: "Optional extra",
        blurb: "An add-on the client can take or leave.",
        priceCents: Math.max(2500, Math.round(basePrice * 0.15)),
        maxQty: 3,
      });
    }

    blocks.push({
      id: "services",
      kind: "services",
      title: "Your package",
      required: true,
      services: { mode: d.multiSelect || d.serviceCount === 1 ? "multi" : "single", options },
    });
  }

  if (d.wantsQuestionnaire) {
    blocks.push({
      id: "questionnaire",
      kind: "questionnaire",
      title: "A few details",
      required: false,
      requiresComplete: gate(
        "questionnaire",
        previous("services"),
        "the questions depend on what was chosen",
      ),
      questionnaire: {
        questions: [
          { id: "where", prompt: "Where is it happening?", kind: "text", required: true },
          { id: "when", prompt: "Roughly when?", kind: "text", required: false },
        ],
      },
    });
  }

  if (d.wantsContract) {
    blocks.push({
      id: "contract",
      kind: "contract",
      title: "The agreement",
      required: true,
      requiresComplete: gate(
        "contract",
        previous("questionnaire", "services"),
        "a contract has to know what it covers",
      ),
      contract: {
        signatureRequired: d.signatureRequired,
        body:
          "{{business}} will provide {{services}} for {{client}}.\n\n" +
          "The total is {{total}}, of which {{deposit}} is due to reserve the date. " +
          "The balance is payable on delivery.\n\n" +
          "Either party may cancel in writing up to 30 days before.",
      },
    });
  }

  if (d.wantsInvoice) {
    // The gate is applied when the brief asked for it, and also whenever there
    // is a signature to wait for. Taking money for terms nobody accepted is the
    // mistake this whole format exists to prevent, so it is the default rather
    // than an option, and the derivation says so out loud.
    const gated = d.wantsContract && d.signatureRequired;
    blocks.push({
      id: "invoice",
      kind: "invoice",
      title: "Payment",
      required: true,
      requiresComplete: gated
        ? gate(
            "invoice",
            previous("contract"),
            d.gatePaymentBehindSignature
              ? "you asked for payment to wait for the signature"
              : "there is a signature to wait for, so payment waits for it",
          )
        : gate(
            "invoice",
            previous("questionnaire", "services"),
            "there has to be something to charge for",
          ),
      invoice: { depositBps: d.depositBps ?? 0, taxBps: d.taxBps ?? 0 },
    });
  }

  if (d.wantsScheduler) {
    const after = previous("invoice", "contract", "questionnaire", "services");
    blocks.push({
      id: "scheduler",
      kind: "scheduler",
      title: "Pick a time",
      required: false,
      requiresComplete: gate(
        "scheduler",
        after,
        after === "invoice" ? "the date is held once it is paid for" : "booking comes last",
      ),
      scheduler: {
        slots: [
          { id: "slot_1", startsAt: "Tuesday, 10:00", durationMin: 45 },
          { id: "slot_2", startsAt: "Wednesday, 14:00", durationMin: 45 },
          { id: "slot_3", startsAt: "Friday, 09:30", durationMin: 45 },
        ],
      },
    });
  }

  if (blocks.length === 0) {
    problems.push(
      "Some of that was recognised, but none of it describes a step a client can take.",
    );
    return { document: null, edges: [], problems };
  }

  const id = opts.id ?? "doc_draft";
  const document: SmartFileDoc = {
    id,
    title: d.title ?? "New smart file",
    business: opts.business ?? "Northlight Studio",
    client: opts.client ?? "Your client",
    currency: d.currency,
    blocks,
  };

  void input;
  return { document, edges, problems };
}
