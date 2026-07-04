/**
 * Researched facts about HoneyBook's product and AI work (2026-07), feeding
 * the home page's "HoneyBook, studied up close" section. Not everything here
 * is AI — the referral engine is a growth feature. Sources: honeybook.com
 * product + blog pages, BusinessWire (2025-03-25 AI acceleration release;
 * 2026-05-14 "$400K more" data study), Wikipedia, Times of Israel (unicorn
 * round). Kept as data so the copy stays honest.
 */

export type ProductFeature = {
  key: "leads" | "notetaker" | "builder" | "email" | "trends" | "referral";
  name: string;
  tag: string;
  blurb: string;
  /** grid emphasis: wide cards span two columns on desktop */
  span?: 2;
};

export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    key: "builder",
    name: "AI automations builder",
    tag: "Shipping in the product",
    blurb:
      "Describe your process in one plain-language prompt and HoneyBook builds the whole workflow — you just edit and activate. This is agentic software for people who never wrote a rule engine.",
    span: 2,
  },
  {
    key: "leads",
    name: "Priority leads",
    tag: "Shipping in the product",
    blurb:
      "Historic booking data plus the contact form tells members which lead is most likely to book — and which one carries the bigger budget — before they reply to anyone.",
  },
  {
    key: "notetaker",
    name: "AI Notetaker",
    tag: "Shipping in the product",
    blurb:
      "Online or across the table at a coffee meeting: hit record, get structured notes and next steps shortly after the conversation ends.",
  },
  {
    key: "email",
    name: "Drafts & follow-ups",
    tag: "Shipping in the product",
    blurb:
      "AI-drafted replies, meeting prep summaries before every call, and a nudge when it's the right moment to follow up with a quiet lead.",
  },
  {
    key: "trends",
    name: "Trends & priority list",
    tag: "Shipping in the product",
    blurb:
      "Every morning starts with an AI-built priority list, and the business trends view tracks shifts in leads and revenue without a spreadsheet.",
  },
  {
    key: "referral",
    name: "Referral engine",
    tag: "New in the product",
    blurb:
      "HoneyBook's newest growth play: a pre-written referral ask with a trackable link, so word-of-mouth gets followed all the way from shared link to booked project.",
    span: 2,
  },
];

export const PRODUCT_FACTS = [
  { num: "2013", label: "Born in Tel Aviv, HQ in SF — R&D still in TLV" },
  { num: "$10B+", label: "In business booked through the platform" },
  { num: "70%", label: "Of members using HoneyBook AI decide with more confidence" },
  { num: "$400K", label: "More per year earned by AI-using members, per HoneyBook's own data" },
];

export const PRODUCT_IDEAS = [
  {
    t: "Durable agentic clientflow",
    d: "An agent that runs the whole follow-up thread — drafts, waits, escalates — built as a durable workflow, so it can pause for days and pick up exactly where it left off.",
  },
  {
    t: "An eval harness for AI features",
    d: "Regression tests for the AI itself: score Notetaker summaries and lead scoring against fixed cases, so every prompt or model change ships with proof it didn't get worse.",
  },
  {
    t: "Prompt → on-brand document",
    d: "A member describes a proposal in a sentence and gets back a finished file in their brand — fonts, colors, layout locked. No design step between the ask and the send.",
  },
];

export const PRODUCT_SOURCES = [
  { label: "honeybook.com/product/ai", href: "https://www.honeybook.com/product/ai" },
  { label: "HoneyBook AI vision (blog)", href: "https://www.honeybook.com/blog/honeybook-ai-vision" },
  {
    label: "BusinessWire — AI acceleration",
    href: "https://www.businesswire.com/news/home/20250325533890/en/HoneyBook-Accelerates-AI-Innovation-to-Empower-Small-Businesses",
  },
  {
    label: "BusinessWire — $400K AI study",
    href: "https://www.businesswire.com/news/home/20260514449052/en/HoneyBook-Data-Reveals-Small-Businesses-Using-AI-Earn-$400K-More-Per-Year-Than-Those-Who-Dont",
  },
  { label: "Wikipedia — HoneyBook", href: "https://en.wikipedia.org/wiki/HoneyBook" },
  {
    label: "Product updates, Feb 2026",
    href: "https://www.honeybook.com/blog/product-updates-february-2026",
  },
];
