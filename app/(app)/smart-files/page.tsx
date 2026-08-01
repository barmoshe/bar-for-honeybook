import type { Metadata } from "next";
import Link from "next/link";

import { buildMailtoHref } from "@/lib/contact";

/**
 * A standalone, shareable landing for the smart-file demo.
 *
 * It lives in the (app) group rather than on the pitch page because it points
 * at the working surfaces and should read in their register, not the poster's.
 * Nothing here is addressed to a company: the page explains the thing to
 * whoever gets the link, technical or not, and the deep material sits below
 * the plain-language part rather than in front of it.
 */

export const metadata: Metadata = {
  title: "Smart files, built for real",
  description:
    "A proposal, a contract and an invoice in one link, with a rules engine behind it. Choose, sign, pay.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Smart files, built for real",
    description:
      "A proposal, a contract and an invoice in one link, with a rules engine behind it. Choose, sign, pay.",
    type: "website",
    siteName: "Smart files",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart files, built for real",
    description:
      "A proposal, a contract and an invoice in one link, with a rules engine behind it.",
  },
};

/** The four working surfaces, in the order a visitor should meet them. */
const SURFACES = [
  {
    href: "/f",
    label: "The file",
    title: "What a client receives",
    body: "One link, no account. Pick your services, watch the total move, sign the agreement, then pay. Start here.",
    cta: "Open a file",
  },
  {
    href: "/studio",
    label: "Studio",
    title: "Describe one in a sentence",
    body: "Type something like “photography package, two tiers, contract before payment, 50% deposit” and watch a parser build the file, showing which words produced which block.",
    cta: "Write a brief",
  },
  {
    href: "/console",
    label: "Console",
    title: "The business side",
    body: "Revenue by month, which services actually sell, where files stall, and the median time from sent to signed. Every number is one hand-written SQL statement.",
    cta: "See the numbers",
  },
  {
    href: "/engineering",
    label: "Engineering",
    title: "The receipts",
    body: "The schema, live query plans, the validator refusing two impossible files, and a ledger with buttons that invite you to double-charge it.",
    cta: "Look under it",
  },
] as const;

/** The load-bearing engineering claims, each one checkable on /engineering. */
const BUILD = [
  {
    title: "The rules are a pure function",
    body: "The engine is a Go package with no database, no clock, no network and no environment. Everything it needs arrives as an argument and everything it decides comes back as a value, which is why the same code answers a request in production and runs under go test with nothing stubbed.",
  },
  {
    title: "Gating is a graph, not an if statement",
    body: "A block waits for the blocks it names, so “the invoice is unreachable until the contract is signed” falls out of the graph instead of being special-cased. A cycle cannot be fixed by reordering, so the validator finds it and names the ring; a forward dependency can be, so it suggests the order.",
  },
  {
    title: "A locked block carries no payload",
    body: "An unsigned client receives no invoice lines and no contract prose over the wire, and the server action that takes payment refuses by asking the engine. Withholding it from the page is necessary and not sufficient, because a page is not the only thing that can call a server action.",
  },
  {
    title: "The database is real Postgres",
    body: "Compiled to WebAssembly and running in process. Not a Postgres-flavoured layer over something else: the window functions, the LATERAL joins and the EXPLAIN output on the engineering page are Postgres doing the work. Every query is written by hand, there is no ORM, and no value is ever interpolated into SQL text.",
  },
  {
    title: "The ledger is append-only",
    body: "A unique index on (workspace_id, idempotency_key) is the whole idempotency guarantee, so there is no window in which two deliveries of one webhook both decide they are first. Balances are a SUM rather than a column somebody updates, which is why an event that arrives late still lands on the right total.",
  },
  {
    title: "The parser has no model behind it",
    body: "Studio turns a sentence into a document with rules, and renders the derivation: which phrase produced which block, and what it could not read. It is a public unauthenticated URL, so a key behind it would be an open wallet, and this way it runs in CI, offline, with no spinner.",
  },
] as const;

const CONTACT = buildMailtoHref(
  "Smart files",
  "Hi Bar,\n\nI had a look at the smart-file demo.\n\n",
);

export default function Page() {
  return (
    <div className="hbapp st sfl">
      <header className="st-top">
        <span className="sf-brand">Smart files</span>
        <nav className="st-nav" aria-label="The working surfaces">
          <Link href="/f">The file</Link>
          <Link href="/studio">Studio</Link>
          <Link href="/console">Console</Link>
          <Link href="/engineering">Engineering</Link>
        </nav>
      </header>

      <main className="st-main" id="main">
        <section className="sfl-hero">
          <p className="sf-eyebrow">A working demo</p>
          <h1 className="sf-title">
            A proposal, a contract and an invoice, in one link.
          </h1>
          <p className="sfl-lede">
            That is a smart file. The client opens the link, picks what they
            want, signs the agreement, and pays. No account, no PDF going back
            and forth. This one works end to end: the rules, the database, and
            the money.
          </p>
          <div className="sfl-ctas">
            <Link className="sfl-btn" href="/f">
              Open a working file
            </Link>
            <a className="sfl-btn sfl-btn-quiet" href="#how">
              How it works
            </a>
          </div>
          <p className="sfl-caveat">
            Nothing is charged and no card is taken. Every business, client and
            price in here is invented.
          </p>
        </section>

        <section className="sfl-band" aria-labelledby="what">
          <h2 className="st-h2" id="what">
            What happens in the file
          </h2>
          <ol className="sfl-steps">
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                1
              </span>
              <h3 className="sfl-step-t">A link arrives</h3>
              <p>Nothing to install, nothing to sign up for.</p>
            </li>
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                2
              </span>
              <h3 className="sfl-step-t">You choose</h3>
              <p>Add options and the total moves with you, tax and deposit included.</p>
            </li>
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                3
              </span>
              <h3 className="sfl-step-t">You sign</h3>
              <p>
                The agreement quotes the exact figures you just built, so the
                prose cannot drift from the amount.
              </p>
            </li>
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                4
              </span>
              <h3 className="sfl-step-t">Then you can pay</h3>
              <p>Not before. That is the interesting part.</p>
            </li>
          </ol>
          <p className="sfl-note">
            Step four is the whole trick. The payment block is genuinely
            unreachable until the signature exists: it is not a greyed-out
            button, it is a server that has no answer for you yet.
          </p>
        </section>

        <section className="sfl-section" aria-labelledby="try">
          <h2 className="st-h2" id="try">
            Four ways in
          </h2>
          <p className="st-lede">
            Every one of these is live. The first is the one to try if you only
            open one.
          </p>
          <ul className="sfl-surfaces">
            {SURFACES.map((s) => (
              <li className="sfl-surface" key={s.href}>
                <p className="st-h3">{s.label}</p>
                <h3 className="sfl-surface-t">{s.title}</h3>
                <p className="sfl-surface-b">{s.body}</p>
                <Link className="sfl-surface-cta" href={s.href}>
                  {s.cta}
                  <span aria-hidden="true"> &rarr;</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="sfl-section" id="how" aria-labelledby="how-h">
          <h2 className="st-h2" id="how-h">
            How it is built
          </h2>
          <p className="st-lede">
            The short version: a pure rules engine in Go, real Postgres, and a
            payment step that refuses to be talked into anything. The long
            version runs itself on the engineering page.
          </p>
          <ul className="sfl-build">
            {BUILD.map((b) => (
              <li className="sfl-build-item" key={b.title}>
                <h3 className="sfl-build-t">{b.title}</h3>
                <p className="sfl-build-b">{b.body}</p>
              </li>
            ))}
          </ul>
          <p className="sfl-note">
            Every push runs go vet, the Go tests, a formatting check, eslint,
            both proof scripts and the production build before anything
            deploys. The database proof imports the app&rsquo;s own queries
            rather than restating their SQL, so it cannot pass while the app
            fails.
          </p>
        </section>

        <section className="sfl-band sfl-honest" aria-labelledby="honest">
          <h2 className="st-h2" id="honest">
            What is not real
          </h2>
          <ul className="sfl-honest-list">
            <li>
              The payment step writes to a ledger rather than to a gateway. No
              card is taken and nothing is charged.
            </li>
            <li>
              The database lives inside the running instance, so a cold start
              begins empty and seeds itself on the spot. Within a warm instance
              a signature stays signed; across a cold start it does not.
            </li>
            <li>
              All of the businesses, clients, services and prices are made up.
            </li>
          </ul>
          <p className="sfl-note">
            That is a trade rather than an oversight. A hosted database means a
            connection string in a repository and a free tier that deletes it
            after thirty days, and a demo that resets is a smaller lie than a
            link that returns 500.
          </p>
        </section>

        <footer className="sfl-foot">
          <p className="sfl-foot-lead">
            Built by Bar Moshe. The engine, the schema, the queries and the
            parser are all mine to explain.
          </p>
          <p className="sfl-foot-links">
            <Link href="/f">Open a file</Link>
            <a href={CONTACT}>Email me</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
