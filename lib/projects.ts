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
 * Shipped proofs, ordered for an engineering audience: AI / agent / systems
 * work first, then the craft demos. Blurbs are in Bar's plain "I" voice.
 */
export const PROJECTS: Project[] = [
  {
    name: "MDP",
    blurb:
      "An open-source compiler that turns one Markdown source into design-locked decks, pages, and docs. Built for AI agents to write into. Zero-dependency Node engine, on npm.",
    tag: "Open source · AI tooling",
    href: "https://barmoshe.github.io/mdp/",
    accent: "yellow",
    span: 2,
  },
  {
    name: "Entailer",
    blurb:
      "A logician's-pass linter for prose and specs — think markdownlint, but for logical validity. An LLM-in-the-loop translator formalizes the load-bearing claims, a deterministic core checks whether arguments follow and requirements are consistent, and every verdict ships with the formalization it judged. Open source, on npm.",
    tag: "Open source · AI + formal logic",
    href: "https://barmoshe.github.io/entailer/",
    accent: "slate",
  },
  {
    name: "Catalogue Orchestrator",
    blurb:
      "A local-first AI video orchestrator: point it at a catalogue of clips and an intent, it indexes everything, retrieves the right moments with RAG, and plans an edit that a deterministic ffmpeg compiler renders into a finished cut. The AI only emits a validated edit list, never raw ffmpeg, so the output stays reproducible. Open source.",
    tag: "Open source · AI video",
    href: "https://barmoshe.github.io/catalogue-orchestrator/",
    accent: "yellow",
  },
  {
    name: "Temporal Data Service",
    blurb:
      "A cross-language data-processing service built on Temporal for durable, fault-tolerant workflows. Featured on Temporal's official code exchange. Go, Python, and TypeScript workers under one orchestration.",
    tag: "Backend · Durable workflows",
    href: "https://temporal.io/code-exchange/cross-language-data-processing-service-with-temporal",
    accent: "teal",
  },
  {
    name: "Creative Harness",
    blurb:
      "An open AI agent harness for Claude Code: skills, hooks and tooling that let one builder ship like a small team.",
    tag: "AI agents · Systems",
    href: "https://github.com/barmoshe/claude-creative-stack",
    accent: "slate",
  },
  {
    name: "Apartment Hunter",
    blurb:
      "A real-estate decision tool: side-by-side comparison, Israeli purchase-tax brackets, a full mortgage calculator. Product-grade UI, shipped solo.",
    tag: "Product · Web app",
    href: "https://apartment-hunter-one.vercel.app",
    accent: "sage",
  },
  {
    name: "Trip Planner",
    blurb:
      "An itinerary, budget, and logistics planner with a live currency converter and a countdown. From brief to live in days.",
    tag: "Product · Web app",
    href: "https://trip-planner-six-iota.vercel.app",
    accent: "slate",
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
  {
    name: "Bloom Garden",
    blurb:
      "A webcam hand-gesture game: pinch to pluck flowers, on-device MediaPipe, no video ever leaves the browser.",
    tag: "Computer vision · Game",
    href: "https://bloom-garden-five.vercel.app",
    accent: "sage",
  },
];
