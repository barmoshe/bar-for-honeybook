# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private, single-page landing site: a creative job application from Bar Moshe to HoneyBook, styled in HoneyBook's rebrand identity (rebel yellow `#FFFA56` + ink `#142127`). The page is intentionally `robots: { index: false, follow: false }` — a shareable link, not a public launch. Keep it that way.

## Commands

```bash
npm install
npm run dev      # dev server at http://localhost:3000 (Turbopack)
npm run build    # production build — CI gate, must pass
npm run lint     # eslint (next/core-web-vitals + typescript, incl. jsx-a11y)
```

There is no test suite. CI (`.github/workflows/ci.yml`) runs `npm run lint` and `npm run build` on every push to `main` and `claude/**` branches and on PRs; Vercel auto-deploys behind that gate, so both must pass before pushing.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Turbopack (`turbopack.root` is pinned in `next.config.ts` — don't remove it; a stray lockfile above the repo would break root inference)
- GSAP + ScrollTrigger for scroll entrances and parallax (only in `HoneyBookApp.tsx`)
- Hand-written CSS design system in `app/globals.css` — **no Tailwind, no CSS modules**
- Pure CSS/SVG animation for the product scenes (no WebGL, no video)
- Path alias `@/*` maps to the repo root

## Architecture

The entire page is one client-component tree. `app/page.tsx` renders `components/HoneyBookApp.tsx` (a `"use client"` component that owns all sections, nav, modal state, and every GSAP animation). `app/ai/page.tsx` is only a redirect to `/#ai` kept for old shared links.

**Copy and content live in `lib/`, not in components.** This is the key separation:

- `lib/projects.ts` — portfolio tiles for the "Work" grid
- `lib/honeybookProduct.ts` — researched HoneyBook facts, product features, ideas, and source links that feed the "HoneyBook, studied up close" section. The file header documents the sources; claims are kept as data so the copy stays honest — do not invent or inflate facts here, and keep source links alongside any new claim.
- `lib/contact.ts` — email/WhatsApp/CV links and href builders (the brief modal composes prefilled messages through `buildWhatsAppHref`/`buildMailtoHref`)

Components:

- `HoneyBookApp.tsx` — the page itself: hero, quote, about, stats, product-preview grid (desktop grid / mobile snap carousel with chip + dot navigation), ideas, fit, work, close, footer, mobile tab bar
- `ProductPreviews.tsx` — six looping product-UI vignettes (one per `ProductFeature.key`), each an original hand-coded CSS/SVG scene inside a shared browser-chrome `Frame`. All decorative (`aria-hidden`).
- `ClientflowGraphic.tsx` — the hero's animated clientflow graphic (SVG path + `animateMotion` dot + floating cards)
- `BriefModal.tsx` — the "Let's talk" dialog: focus trap, Escape to close, body scroll lock, composes prefilled WhatsApp/email messages
- `Decor.tsx` — small decorative SVGs

## Conventions

- **CSS**: everything is in `app/globals.css`, prefixed `hb-` (page) or `hbai-` (product-preview scenes). Design tokens are oklch custom properties scoped to `.hb-root`. New styles follow the existing section-banner comment structure. Per-instance animation values are passed as CSS custom properties inline (`style={{ "--d": "0.5s" } as React.CSSProperties}`).
- **Reduced motion is non-negotiable.** `globals.css` ends with a `prefers-reduced-motion` kill rule that flattens all CSS animation; JS-driven motion (GSAP entrances, magnetic buttons) is additionally guarded with `matchMedia` checks in `HoneyBookApp.tsx`. Any new animation must die cleanly under both.
- **Accessibility**: decorative elements are `aria-hidden`; interactive things are real buttons/links; the lint gate includes jsx-a11y. The hero title splits words into spans but keeps real spaces between them so screen readers and copy-paste see separate words — preserve patterns like this.
- **Copy voice**: first-person, plain, confident, no hype. Git history shows deliberate copy discipline (claims like "live" or "rebuilt" were removed on purpose). Don't reintroduce unverifiable claims; anything factual about HoneyBook belongs in `lib/honeybookProduct.ts` with a source.
- `react-hooks/set-state-in-effect` is deliberately downgraded to a warning in `eslint.config.mjs` (effects legitimately read media-query state and start rAF loops); other lint errors are hard failures.
- Mobile matters: the product previews become a horizontal snap carousel with rAF-throttled scroll syncing, and there's a mobile-only bottom tab bar. Check both desktop and narrow viewports when touching layout.
