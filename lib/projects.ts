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
      "The agent-operated workshop this page came out of. Skills, hooks, and decision logs that let one builder ship like a team.",
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
