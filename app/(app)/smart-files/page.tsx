import type { Metadata } from "next";
import Link from "next/link";

import AppNav from "@/app/(app)/AppNav";

import { buildMailtoHref } from "@/lib/contact";

import { DocumentDiagram, SystemDiagram } from "./Diagrams";

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

/** The working surfaces, in the order a visitor should meet them. */
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
    href: "/console/automations",
    label: "Automations",
    title: "What happens on its own",
    body: "Thank them, wait three days, and chase only the ones who still have not paid. Runs park on a queue until their next step is due, and the clock is a button rather than a three-day wait.",
    cta: "Open automations",
  },
  {
    href: "/engineering",
    label: "Engineering",
    title: "What is underneath",
    body: "The schema, live query plans, the validator rejecting two invalid files, and a ledger you can try to double-charge.",
    cta: "Open engineering",
  },
] as const;

const CONTACT = buildMailtoHref(
  "Smart files",
  "Hi Bar,\n\nI had a look at the smart-file demo.\n\n",
);

export default function Page() {
  return (
    <div className="hbapp st sfl">
      <AppNav title="Smart files" />

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

        <section className="sfl-section" id="how" aria-labelledby="how-h">
          <h2 className="st-h2" id="how-h">
            How it works
          </h2>
          <div className="sfd-pair">
            <DocumentDiagram />
            <SystemDiagram />
          </div>
          <p className="sfl-note">
            Payment is unreachable until the signature exists. Not a disabled
            button: the server will not produce it.
          </p>
          <p className="sfl-note">
            The same file also drives what happens afterwards. Signing starts an
            automation that thanks the client, waits three days, and chases only
            the ones who still have not paid. Waits are measured against a moment
            passed into the engine rather than a system clock, so a three-day
            wait is a button here and a millisecond in the test suite.
          </p>
        </section>

        <section className="sfl-section" aria-labelledby="try">
          <h2 className="st-h2" id="try">
            The surfaces
          </h2>
          <p className="st-lede">
            Every one of them is live. Start with the first.
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

        <section className="sfl-band sfl-honest" aria-labelledby="honest">
          <h2 className="st-h2" id="honest">
            What is not real
          </h2>
          <ul className="sfl-honest-list">
            <li>Payment writes to a ledger, not a gateway. Nothing is charged.</li>
            <li>
              The database lives in the running instance, so a signature
              survives until that instance recycles and no longer.
            </li>
            <li>Every business, client and price is invented.</li>
            <li>
              Automations are the shape of durable execution, not the real
              thing: no retry with backoff, no heartbeat, no cancellation. Emails
              are rows in an outbox and nothing leaves the building.
            </li>
          </ul>
          <p className="sfl-note">
            A trade, not an oversight. A demo that resets beats a link that
            returns 500.
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
