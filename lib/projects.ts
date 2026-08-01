/**
 * The four surfaces of the working smart-file demo that lives in this repo.
 *
 * Kept beside PROJECTS because it is the same kind of claim, with one
 * difference worth a separate list: all of it runs on this domain, so the tiles
 * go to the thing itself rather than to a write-up of it.
 */
export const DEMO_SURFACES = [
  {
    href: "/f",
    name: "The client link",
    proves:
      "No login. Pick a package, watch the invoice recompute, read a contract built from those same numbers, sign, and only then reach payment.",
    accent: "yellow" as const,
  },
  {
    href: "/studio",
    name: "The studio",
    proves:
      "Describe a file in a sentence and watch a parser assemble it, showing which phrase produced which block and admitting what it could not read.",
    accent: "sage" as const,
  },
  {
    href: "/console",
    name: "The console",
    proves:
      "Revenue by month with a running total, what sells ranked by revenue, the funnel, time to sign. One hand-written SQL statement per number.",
    accent: "teal" as const,
  },
  {
    href: "/engineering",
    name: "The receipts",
    proves:
      "The schema, each query beside its live EXPLAIN, the validator refusing two broken files, and a ledger you can try to double-charge.",
    accent: "slate" as const,
  },
];

export type Project = {
  name: string;
  blurb: string;
  tag: string;
  href: string;
  /** modular-grid accent: which token tints the tile */
  accent: "yellow" | "sage" | "teal" | "slate";
  /** grid emphasis: feature tiles span two columns on desktop */
  span?: 2;
};

/**
 * Shipped proofs, ordered as five grid rows for an engineering audience:
 * flagship AI tooling + backend up top, then the AgentX thesis + AI systems,
 * then product apps, then the craft demos. Three wide tiles (MDP, AgentX essay,
 * Apartment Hunter) keep the 3-column grid filling exactly at 15 cells / 5 rows
 * — reorder with the cell count in mind.
 */
export const PROJECTS: Project[] = [
  // Row 1 — the headline: AI tooling flagship + backend credibility
  {
    name: "MDP",
    blurb:
      "A compiler that turns one Markdown source into design-locked decks, pages, and docs. Built for AI agents to write into. Zero-dependency Node engine, on npm.",
    tag: "Compiler · AI tooling",
    href: "https://barmoshe.github.io/mdp/",
    accent: "yellow",
    span: 2,
  },
  {
    name: "Temporal Data Service",
    blurb:
      "A cross-language data-processing service built on Temporal for durable, fault-tolerant workflows. Featured on Temporal's official code exchange. Go, Python, and TypeScript workers under one orchestration.",
    tag: "Backend · Durable workflows",
    href: "https://temporal.io/code-exchange/cross-language-data-processing-service-with-temporal",
    accent: "teal",
  },
  // Row 2 — the AgentX thesis, the argument this whole application makes
  {
    name: "DevX Is Dead. Long Live AgentX.",
    blurb:
      "An essay: agents do the real building now, so I argue every project should be designed around the agent's access and flow, not the developer's. On the split between orchestrating and executing, and the accountability gap that comes with handing agents real power. Backed by a fan-out research pass with adversarially fact-checked claims.",
    tag: "Essay · Agent experience",
    href: "https://medium.com/@barmoshe/devx-is-dead-long-live-agentx-bbcff45228fd",
    accent: "teal",
    span: 2,
  },
  // AI systems
  {
    name: "Entailer",
    blurb:
      "A logician's-pass linter for prose and specs — think markdownlint, but for logical validity. An LLM-in-the-loop translator formalizes the load-bearing claims, a deterministic core checks whether arguments follow and requirements are consistent, and every verdict ships with the formalization it judged. On npm.",
    tag: "Linter · AI + formal logic",
    href: "https://barmoshe.github.io/entailer/",
    accent: "slate",
  },
  {
    name: "Creative Harness",
    blurb:
      "An AI agent harness for Claude Code: skills, hooks and tooling that let one builder ship like a small team.",
    tag: "AI agents · Systems",
    href: "https://github.com/barmoshe/claude-creative-stack",
    accent: "sage",
  },
  {
    name: "bar for companies",
    blurb:
      "A live gallery of every bespoke marketing page shipped this way: dozens of sites, each rebuilt in a different company's own brand language, from type and color to motion. One data-driven Next.js app, with automated logo fetching and screenshot capture keeping every entry current.",
    tag: "Marketing sites · Brand systems",
    href: "https://bar-for-companies.vercel.app",
    accent: "slate",
  },
  {
    name: "Catalogue Orchestrator",
    blurb:
      "A local-first AI video orchestrator: point it at a catalogue of clips and an intent, it indexes everything, retrieves the right moments with RAG, and plans an edit that a deterministic ffmpeg compiler renders into a finished cut. The AI only emits a validated edit list, never raw ffmpeg, so the output stays reproducible.",
    tag: "AI video · Orchestration",
    href: "https://barmoshe.github.io/catalogue-orchestrator/",
    accent: "yellow",
  },
  // Row 3 — product apps, anchored by a wide feature tile
  {
    name: "Apartment Hunter",
    blurb:
      "A real-estate decision tool: side-by-side comparison, Israeli purchase-tax brackets, a full mortgage calculator. Product-grade UI, shipped solo.",
    tag: "Product · Web app",
    href: "https://apartment-hunter-one.vercel.app",
    accent: "teal",
    span: 2,
  },
  {
    name: "Trip Planner",
    blurb:
      "An itinerary, budget, and logistics planner with a live currency converter and a countdown. From brief to live in days.",
    tag: "Product · Web app",
    href: "https://trip-planner-six-iota.vercel.app",
    accent: "slate",
  },
  // Row 4 — craft demos
  {
    name: "Bloom Garden",
    blurb:
      "A webcam hand-gesture game: pinch to pluck flowers, on-device MediaPipe, no video ever leaves the browser.",
    tag: "Computer vision · Game",
    href: "https://bloom-garden-five.vercel.app",
    accent: "sage",
  },
  {
    name: "Biome",
    blurb:
      "A generative pad synth in the browser, state-machine driven. Sound design as software.",
    tag: "Generative · Audio",
    href: "https://biome-synth.lovable.app",
    accent: "yellow",
  },
  {
    name: "Aurora",
    blurb:
      "A hand-written WebGL silk field, the same shader family flowing behind this hero. Craft on the metal.",
    tag: "WebGL · Graphics",
    href: "https://aurora-eight-iota.vercel.app",
    accent: "teal",
  },
];
