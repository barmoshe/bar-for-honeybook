# bar-for-honeybook

A private, hand-built landing page for **HoneyBook**: a creative job application
that positions **Bar Moshe** as an AI-native builder who wants to build at
HoneyBook. The page itself is the proof: bespoke, animated, and dressed in
HoneyBook's own rebrand identity (verified **rebel yellow `#FFFA56`** + **ink
`#142127`**).

The hero is an animated "clientflow" graphic (floating inquiry → proposal → paid
cards on a flowing connector) over drifting gradient blobs. No WebGL shader.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Hanken Grotesk via `next/font/google` (free analog of HoneyBook's Aeonik)
- GSAP ScrollTrigger for scroll entrances + the modular-grid "clientflow" stagger
- Self-contained CSS design system (oklch tokens scoped to `.hb-root`), no Tailwind
- WebGL shader with the ADR-0057 efficiency envelope (DPR ≤ 0.66, hidden-tab
  pause, reduced-motion / no-WebGL static fallback)

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint + jsx-a11y gate
```

## Privacy

The page is `robots: { index: false, follow: false }` — a private shareable link,
not a public launch.

## TODO

- Replace `public/cv/bar-moshe-cv.pdf` with Bar's real CV (currently a marked
  placeholder).
