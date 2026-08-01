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
    title: "What a client sees",
    body: "One link, no account. Pick services, sign the agreement, pay. Start here.",
    cta: "Open a file",
  },
  {
    href: "/studio",
    label: "Studio",
    title: "Build one from a sentence",
    body: "Type a brief like “photography package, two tiers, contract before payment, 50% deposit”. A parser builds the file and marks which words produced which block.",
    cta: "Open studio",
  },
  {
    href: "/console",
    label: "Console",
    title: "The business side",
    body: "Revenue by month, which services sell, where files stall, median time from sent to signed. Each number is one hand-written SQL query.",
    cta: "Open console",
  },
  {
    href: "/engineering",
    label: "Engineering",
    title: "What is underneath",
    body: "The schema, live query plans, the validator rejecting two invalid files, and a ledger you can try to double-charge.",
    cta: "Open engineering",
  },
] as const;

/** The load-bearing engineering claims, each one checkable on /engineering. */
const BUILD = [
  {
    title: "The rules are a pure function",
    body: "A Go package with no database, no clock and no network. Inputs arrive as arguments, decisions come back as values, so the same code serves production and runs under go test with nothing stubbed.",
  },
  {
    title: "Gating is a graph, not an if statement",
    body: "Each block names the blocks it waits for, so “the invoice is locked until the contract is signed” comes out of the graph. The validator reports a cycle by naming the loop, and a wrong order by giving the right one.",
  },
  {
    title: "A locked block sends no data",
    body: "An unsigned client never receives the invoice lines or the contract text. The server action that takes payment asks the engine first, because hiding a block in the page does not stop anything else calling that action.",
  },
  {
    title: "The database is real Postgres",
    body: "Compiled to WebAssembly, running in process. The window functions, LATERAL joins and EXPLAIN output on the engineering page are Postgres doing the work. Every query is hand-written: no ORM, and no value is ever put into SQL text.",
  },
  {
    title: "The ledger is append-only",
    body: "A unique index on (workspace_id, idempotency_key) is the whole idempotency guarantee, so two deliveries of one webhook cannot both count. Balances are a SUM rather than a stored column, so an event that arrives late still lands on the right total.",
  },
  {
    title: "The parser uses no model",
    body: "Studio turns a sentence into a document with rules, and shows which phrase produced which block and what it could not read. No API key behind it, so it runs in CI, offline.",
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
            want, signs, and pays. No account, no PDF back and forth. This one
            runs end to end: the rules, the database and the payment step.
          </p>
          <div className="sfl-ctas">
            <Link className="sfl-btn" href="/f">
              Open a file
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
              <p>The total updates as you add options, tax and deposit included.</p>
            </li>
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                3
              </span>
              <h3 className="sfl-step-t">You sign</h3>
              <p>
                The agreement quotes the figures you just built, so the text
                cannot disagree with the amount.
              </p>
            </li>
            <li className="sfl-step">
              <span className="sfl-step-n" aria-hidden="true">
                4
              </span>
              <h3 className="sfl-step-t">Then you can pay</h3>
              <p>Not before.</p>
            </li>
          </ol>
          <p className="sfl-note">
            The payment block is unreachable until the signature exists. Not a
            disabled button: the server will not produce it.
          </p>
        </section>

        <section className="sfl-section" aria-labelledby="try">
          <h2 className="st-h2" id="try">
            Four surfaces
          </h2>
          <p className="st-lede">
            All four are live. Start with the first.
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
            A rules engine in Go, real Postgres, and a payment step that checks
            the engine before it does anything. The engineering page runs each
            of these claims live.
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
            Every push runs go vet, the Go tests, a format check, eslint, both
            proof scripts and the production build before deploying. The
            database proof imports the app&rsquo;s own queries instead of
            restating the SQL, so it cannot pass while the app fails.
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
            A trade, not an oversight. A hosted database means a connection
            string in a public repository and a free tier that deletes it after
            thirty days. A demo that resets beats a link that returns 500.
          </p>
        </section>

        <footer className="sfl-foot">
          <p className="sfl-foot-lead">
            Built by Bar Moshe. I wrote the engine, the schema, the queries and
            the parser.
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
