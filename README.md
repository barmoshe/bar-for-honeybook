# bar-for-honeybook

A job application to **HoneyBook** that is also a working piece of software.

The page argues that Bar Moshe can build. The rest of the repo is that argument
made rather than stated: a **working smart-file engine**, in HoneyBook's own
brand, with a Go rules engine, PostgreSQL, and an engineering page that runs
everything it claims.

**Live:** https://bar-for-honeybook.vercel.app

| Surface | What it is |
|---|---|
| `/` | The pitch, and the way into the demo |
| `/smart-files` | A landing for the demo that names no company, safe to send to anyone |
| `/f` | The client link. No login. Choose, sign, pay |
| `/studio` | Describe a file in a sentence and watch a parser build it |
| `/console` | Revenue, ranking, funnel, time to sign |
| `/console/automations` | Triggers, waits and conditions on a Postgres queue |
| `/engineering` | The schema, live query plans, and a ledger you can try to double-charge |

## The problem it models

A smart file is HoneyBook's signature format: proposal, contract and invoice in
one interactive link. It decomposes into a genuinely hard backend problem.

Blocks are ordered and coupled. Choosing services recomputes the invoice. The
contract interpolates values from both, so the prose a client signs cannot drift
from the amount they are charged. And when a signature is required with the
invoice placed after the contract, the invoice is **genuinely unreachable**
until it is signed. That last one is a gating graph, not an `if` statement.

## How it is built

**The rules are a pure function.** `engine/` is a Go package with no database,
no clock, no network and no environment. Everything it needs arrives as an
argument and everything it decides comes back as a value, which is why the same
code answers an HTTP request on Vercel and runs under `go test` with nothing
stubbed. It owns *what is allowed*; the Next.js side owns *what happened*.

**Gating is general.** A block waits for the blocks named in
`requiresComplete`, so "the invoice is unreachable until the contract is signed"
falls out of a graph rather than being special-cased. `Validate` separates the
two ways that graph can fail, because a builder has to describe them
differently: a **cycle** cannot be fixed by reordering (Kahn's algorithm finds
it and names the ring), while a **forward dependency** can be fixed by exactly
that, and the validator suggests the order.

**A locked block carries no payload.** An unsigned client receives no invoice
lines and no contract prose over the wire, and the server action that takes
payment refuses by asking the engine. Withholding the payload from the page is
necessary and not sufficient, because a page is not the only thing that can call
a server action.

**Money is integer cents** everywhere, rounding half away from zero, symmetric
below zero.

**The database is real PostgreSQL**, compiled to WebAssembly and running
in-process. Not a Postgres-like layer over something else: the window functions,
the LATERAL joins and the `EXPLAIN` output on `/engineering` are Postgres doing
the work. Every query is written by hand, there is no ORM, and no value is ever
interpolated into SQL text.

**The ledger is append-only.** A unique index on
`(workspace_id, idempotency_key)` is the whole idempotency guarantee: no
read-then-write, so no window in which two deliveries of one webhook both decide
they are first. Balances are a `SUM` over `occurred_at` rather than a column
somebody updates, which is why an event that arrives late still lands on the
right total. There are buttons on `/engineering` that try to break both.

**Automations are a queue, not a cron.** Signing a file starts a run that thanks
the client, waits three days, and chases only the ones who still have not paid.
Runs park on a `resume_at` and are claimed with `FOR UPDATE SKIP LOCKED` behind
a partial index. Deciding the next step is the same pure Go function discipline
as the gating rules, with the current moment passed in rather than read, which is
why a three-day wait is a button on the page and a millisecond in the tests. It
is the shape of durable execution and not the thing: no retry with backoff, no
heartbeat, no cancellation. Those are most of the reasons Temporal exists.

**The parser has no model behind it.** `/studio` turns a sentence into a
document with rules, and renders the derivation: which phrase produced which
block, and what it could not read. That is deliberate. It is a public
unauthenticated URL, so a key behind it is an open wallet; the demo's claim is
that the output is provably correct, and a parser can show which words produced
which block where a model can only be asked to explain itself afterwards; and it
runs in CI, offline, with no spinner and no failure mode.

## What is not real

The payment step writes to a ledger rather than to a gateway. No card is taken
and nothing is charged. The database lives in the function instance, so a cold
start begins empty and seeds on the spot: within a warm instance a signature
stays signed, across a cold start it does not. All inventory, clients and
businesses are fictional.

That is a trade, not an oversight. A hosted Postgres means a connection string
in a public repository, an account that can be suspended out from under a demo,
and free tiers that delete the database after thirty days or pause a project
nobody visited this week. An embedded database that resets is a smaller lie than
a link that returns 500.

## Running it

```bash
npm install && npm run dev
```

`npm run dev` starts **two** processes: Next, and the Go engine on
`127.0.0.1:4310`. The app itself no longer needs the second one, because the
engine is also compiled to WebAssembly and called in-process; it is started so
the HTTP transport stays exercised and the prove scripts can run against it.

| Script | What it does |
|---|---|
| `npm run dev` | Next plus the Go engine |
| `npm run build` | Production build, the CI gate |
| `npm run lint` | eslint, including `jsx-a11y` |
| `npm run test:engine` | `go test` over the engine, api and httpx |
| `npm run prove:db` | Every hand-written query against a throwaway in-memory database |
| `npm run prove:parser` | Eight briefs, two of which must be refused, each validated by the engine |
| `npm run prove:actions` | The gate, against a real database, asserting on tables not return values |
| `npm run prove:transports` | WASM and HTTP answer byte for byte identically |
| `npm run prove:automations` | Triggers fire once, waits are real, conditions stop |
| `npm run prove` | All of them |

`prove:db` imports `lib/db/queries.ts` directly rather than restating its SQL,
so it cannot pass while the app fails.

## Layout

```
engine/               the Go engine, pure, with its tests
api/engine.go         one Vercel Function, dispatching on an op
cmd/enginewasm/       the same package built for GOOS=js
cmd/engine/           the same handler, served locally for development
httpx/                JSON plumbing shared by /api
lib/engine.ts         types + money. client safe, keep it that way
lib/engine-server.ts  calling the engine. server-only
lib/clientflow.ts     the gate
lib/automations.ts    the runner
lib/db/               schema, seed, client, every query
lib/parser.ts         plain language to a smart file, with its derivation
app/(app)/            the working surfaces, sharing AppNav and app.css
components/           the pitch page
```

## Notes

Several things cost real time here and are worth knowing before touching it.

`lib/engine.ts` must stay free of anything Node-only, because client components
import it and a bundler traces a dynamic import as eagerly as a static one.
Relatedly and worse: importing even a *type* from a `server-only` module into a
client component does not fail the build, it silently stops that component
hydrating. Buttons render, nothing is bound to them, and no error appears.

Vercel compiles each `.go` file under `/api` in isolation alongside a generated
entrypoint, so files there cannot see each other even in the same package.
Anything shared has to be importable, which is what `httpx/` is for.

`vercel dev` generates its entrypoint and its dev-server main into one directory
and then fails to build them, even with a single Go function. That is why
`cmd/engine` exists, serving the same handler so there is nothing to keep in
sync.

The dev engine reads `ENGINE_PORT`, not `PORT`. Next reads `PORT`, and any
harness that injects one would otherwise hand the same socket to both processes
and leave whichever bound first serving everything, which presents as a routing
bug in the app rather than as a port collision.

`public/engine.wasm` is committed, because the Go toolchain exists during
Vercel's build and not inside the running function. Rebuild it with
`npm run build:wasm` after touching `engine/`. The staleness guard is
behavioural rather than a byte diff, since the bytes depend on the exact Go
patch release.

Reach the engine at `VERCEL_PROJECT_PRODUCTION_URL`, never `VERCEL_URL`: the
deployment-specific host sits behind Vercel's SSO wall, so a server component
fetching its own function 401s. That one only breaks in production.

The site is `robots: noindex` on every route. It is a shareable link, not a
public launch.
