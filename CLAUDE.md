# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A job application to HoneyBook that is also a working piece of software. The
page at `/` argues that Bar Moshe can build; the rest of the repo is that
argument made rather than stated.

**Public repo.** `robots: noindex` on every route: a shareable link, not a
launch. Keep both facts true.

| Surface | What it is |
|---|---|
| `/` | The pitch page. Hero, the demo, HoneyBook studied up close, work, close |
| `/smart-files` | A company-agnostic landing for the demo, safe to send to anyone |
| `/f`, `/f/[token]` | The client link. No login. Choose, sign, pay |
| `/studio` | A brief in one sentence becomes a smart file, with its derivation shown |
| `/console` | Revenue, ranking, funnel, time to sign |
| `/console/automations` | Triggers, waits, conditions, and a clock you can advance |
| `/engineering` | Schema, live query plans, the validator refusing broken files, a ledger you can try to double-charge |

## The one rule

**Deciding is a pure Go function. State is Postgres.**

`engine/` has no database, no clock, no network and no environment. It owns
*what is allowed* and *what happens next*; everything else owns *what happened*.
If you are about to write a rule in TypeScript, it belongs in Go, where it has
tests.

The gate this all exists for: an invoice is unreachable until its contract is
signed. It is enforced in `lib/clientflow.ts`, which asks the engine before
writing, and that is why the file is separate from the server actions, which
call `revalidatePath` and therefore only run inside a request.

## Commands

```bash
npm install
npm run dev            # Next + the Go engine
npm run build          # production build, a CI gate
npm run lint           # eslint incl. jsx-a11y
npm run test:engine    # go test over engine, api, httpx, cmd
npm run prove          # every prove script
npm run build:wasm     # rebuild public/engine.wasm, then commit it
```

The prove scripts answer questions only their own runtime can:

| Script | What it proves |
|---|---|
| `prove:db` | Postgres accepts every hand-written query. Imports the real `queries.ts`, not a copy of its SQL |
| `prove:parser` | Eight briefs, two of which must be refused, each validated by the live engine |
| `prove:actions` | The gate. Real functions, real database, asserting on tables rather than return values |
| `prove:transports` | WASM and HTTP answer byte for byte identically |
| `prove:automations` | Triggers fire once, waits are real, conditions stop |

`prove:parser`, `prove:transports` and `prove:automations` need the HTTP engine
up (`npm run engine`). CI starts it.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Turbopack
- **Go** for the rules and automation engine, reached two ways (below)
- **PGlite**: real PostgreSQL compiled to WebAssembly, in-process. Every query
  hand-written, no ORM, nothing interpolated into SQL text
- GSAP + ScrollTrigger, only in `components/HoneyBookApp.tsx`
- Hand-written CSS design system. **No Tailwind, no CSS modules.**
  `app/globals.css` for the pitch page, `app/(app)/app.css` for the surfaces,
  palette shared by selector (`.hb-root, .hbapp`)
- Path alias `@/*` maps to the repo root

## Layout

```
engine/               the Go engine, pure, with its tests
api/engine.go         one Vercel Function, dispatching on an op
cmd/enginewasm/       the same package built for GOOS=js
cmd/engine/           the same handler, served locally for development
httpx/                JSON plumbing shared by /api
lib/engine.ts         types + money. CLIENT SAFE, keep it that way
lib/engine-server.ts  calling the engine. server-only
lib/clientflow.ts     the gate
lib/automations.ts    the runner
lib/db/               schema, seed, client, every query
lib/parser.ts         plain language to a smart file, with its derivation
app/(app)/            the working surfaces, sharing AppNav and app.css
components/           the pitch page
```

## Things that will cost you an afternoon

1. **`lib/engine.ts` must stay free of anything Node-only.** Client components
   import it. A bundler traces a dynamic import as eagerly as a static one, so
   `node:fs` reachable from there lands in the browser bundle and fails the
   build. Calling the engine lives in `lib/engine-server.ts`.
2. **Never import a type from a `server-only` module into a client component.**
   It does not fail the build. The component silently stops hydrating: buttons
   render, nothing is bound, no error appears anywhere. Shared types belong in
   `lib/engine.ts`.
3. **Vercel compiles each `.go` file under `/api` in isolation**, alongside a
   generated entrypoint, so files there cannot see each other even in the same
   package. Anything shared goes in `httpx/`.
4. **`vercel dev`'s Go builder is broken**, even with one function: it generates
   its entrypoint and its dev-server main into one directory and then fails to
   build them. That is why `cmd/engine` exists, serving the same handler.
5. **The dev engine reads `ENGINE_PORT`, not `PORT`.** Next reads `PORT`, so any
   harness that injects one hands the same socket to both processes. It presents
   as pages returning Go's plain `404 page not found`.
6. **Reach the engine at `VERCEL_PROJECT_PRODUCTION_URL`, never `VERCEL_URL`.**
   The deployment-specific host sits behind Vercel's SSO wall, so a server
   component fetching its own function 401s. This only breaks in production.
7. **`public/engine.wasm` is committed.** The Go toolchain exists during
   Vercel's build, not inside the function. Rebuild with `npm run build:wasm`
   after touching `engine/`. `prove:transports` catches a stale one
   behaviourally; a byte diff would fail on a different Go patch release.
8. **PGlite returns `Date` objects, not ISO strings.** Slicing `String(value)`
   and replacing the "T" turns "Tue Aug 04" into "ue Aug 04".
9. **Concurrent sessions have worked in this repo.** `git fetch` before pushing.

## House rules for copy

First person, plain, matter-of-fact. **No em dashes.** No years-of-experience
number, no seniority claims, no marketing voice. Never present `bar_builds`
itself as portfolio work; "Creative Harness" is the acceptable framing.

State the limits where they apply rather than hiding them: payments are
simulated, the database resets on cold start, the automation queue is the shape
of durable execution and not the thing itself. Every one of those sentences is
load-bearing, and removing one would make the page dishonest rather than tidy.
