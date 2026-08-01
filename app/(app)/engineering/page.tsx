import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";

import AppNav from "@/app/(app)/AppNav";

import { explain } from "@/lib/db/client";
import * as db from "@/lib/db/queries";
import { money, type SmartFileDoc } from "@/lib/engine";
import { resolveDocument, validateDocument } from "@/lib/engine-server";
import { currentWorkspace } from "@/lib/workspace";

import ReplayProof from "./ReplayProof";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Engineering",
  robots: { index: false, follow: false },
};

/** A three-block file used only to demonstrate the engine on this page. */
const DEMO: SmartFileDoc = {
  id: "doc_explainer",
  title: "Wedding photography",
  business: "Northlight Studio",
  client: "Dana",
  currency: "USD",
  blocks: [
    {
      id: "services",
      kind: "services",
      title: "Your package",
      required: true,
      services: {
        mode: "multi",
        options: [
          { id: "base", name: "Full-day coverage", priceCents: 240000 },
          { id: "album", name: "Printed album", priceCents: 34000, maxQty: 3 },
        ],
      },
    },
    {
      id: "contract",
      kind: "contract",
      title: "The agreement",
      required: true,
      requiresComplete: ["services"],
      contract: { signatureRequired: true, body: "Total {{total}}, deposit {{deposit}}." },
    },
    {
      id: "invoice",
      kind: "invoice",
      title: "Payment",
      required: true,
      requiresComplete: ["contract"],
      invoice: { depositBps: 5000, taxBps: 1000 },
    },
  ],
};

/** Two documents that cannot work, for two different reasons. */
const CYCLIC: SmartFileDoc = {
  id: "doc_cycle",
  title: "A loop",
  business: "",
  client: "",
  currency: "USD",
  blocks: [
    { id: "a", kind: "contract", title: "A", required: true, requiresComplete: ["c"], contract: { body: "x", signatureRequired: true } },
    { id: "b", kind: "contract", title: "B", required: true, requiresComplete: ["a"], contract: { body: "x", signatureRequired: true } },
    { id: "c", kind: "contract", title: "C", required: true, requiresComplete: ["b"], contract: { body: "x", signatureRequired: true } },
  ],
};

const MISORDERED: SmartFileDoc = {
  id: "doc_order",
  title: "Wrong order",
  business: "",
  client: "",
  currency: "USD",
  blocks: [
    { id: "invoice", kind: "invoice", title: "Payment", required: true, requiresComplete: ["contract"], invoice: { depositBps: 5000, taxBps: 0 } },
    { id: "contract", kind: "contract", title: "The agreement", required: true, contract: { body: "x", signatureRequired: true } },
  ],
};

export default async function Page() {
  const workspace = await currentWorkspace();

  const schema = await readFile(path.join(process.cwd(), "lib", "db", "schema.sql"), "utf8");

  const files = await db.documentSummaries(workspace);
  const paid = files.rows.find((f) => f.stage === "paid") ?? files.rows[0];
  const currency = paid?.currency ?? "USD";

  // The engine, walked through three states, live. Nothing here is a captured
  // log: these are three calls to the same Go function this page could not
  // render without.
  const [empty, chosen, signed] = await Promise.all([
    resolveDocument(DEMO, {}),
    resolveDocument(DEMO, { selections: { services: [{ optionId: "base" }, { optionId: "album", qty: 2 }] } }),
    resolveDocument(DEMO, {
      selections: { services: [{ optionId: "base" }, { optionId: "album", qty: 2 }] },
      signed: { contract: "Dana" },
    }),
  ]);

  const [cyclic, misordered] = await Promise.all([
    validateDocument(CYCLIC),
    validateDocument(MISORDERED),
  ]);

  const plans = await Promise.all([
    plan("The file list", db.SQL_DOCUMENT_SUMMARIES, [workspace, 50],
      "Four aggregates over four different tables. Under one GROUP BY their rows multiply against each other and the money comes out too high; LEFT JOIN LATERAL keeps each aggregate looking only at its own table."),
    plan("Rebuilding one client's state", db.SQL_CLIENT_STATE, [paid?.id ?? ""],
      "Five reads in one round trip. Each branch tags its rows with a source and TypeScript reassembles them, which is more SQL than five small selects and considerably less waiting."),
    plan("Revenue by month", db.SQL_MONTHLY_REVENUE, [workspace],
      "Three window functions over one scan: running total, previous month, and the change between them. NULLIF keeps the first month an absent value rather than a division by zero."),
    plan("What sells", db.SQL_SERVICE_RANKING, [workspace],
      "The price of an option lives inside the document's jsonb block tree, so this cross-references relational selections against a document-shaped catalogue with jsonb_array_elements in a LATERAL join."),
    plan("The funnel", db.SQL_FUNNEL, [workspace],
      "Counted with FILTER in one pass so every step is measured against the same snapshot. Five separate queries against a live table can report more signatures than files."),
  ]);

  return (
    <div className="hbapp st eg">
      <AppNav title="Engineering" current="/engineering" />

      <main className="st-main eg-main" id="main">
        <p className="sf-eyebrow">How it is built</p>
        <h1 className="sf-title">The receipts.</h1>
        <p className="st-lede">
          This page runs everything it claims. The engine tables below are three
          live calls, the validator messages are real refusals, the query plans
          are EXPLAIN ANALYZE against the database serving this request, and the
          ledger proof has a button.
        </p>

        <section className="eg-honest">
          <h2 className="st-h2">What is not real</h2>
          <p>
            The payment step writes to a ledger rather than to a gateway: no card
            is taken and nothing is charged. The database is PostgreSQL compiled
            to WebAssembly, running inside this function instance, so it is
            genuinely Postgres and genuinely not durable. A cold start begins
            with an empty database and seeds it on the spot. Within a warm
            instance a signature stays signed; across a cold start it does not.
          </p>
          <p>
            That is a trade, not an oversight. The alternative was a hosted
            Postgres, which means a connection string in a public repository, an
            account that can be suspended out from under a demo, and free tiers
            that delete the database after thirty days or pause a project nobody
            visited this week. An embedded database that resets is a smaller lie
            than a link that returns 500.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">The rules are a pure function</h2>
        <p className="eg-p">
          The gating rules are a Go package with no database, no clock, no
          network and no environment. Everything it needs arrives as an argument
          and everything it decides comes back as a value, which is why it can
          answer an HTTP request on Vercel and run in <code>go test</code> with
          nothing stubbed. In production it is one Vercel Function; in
          development it is the same handler behind a local server.
        </p>
        <p className="eg-p">
          The split it enforces: this package owns <em>what is allowed</em>, and
          the Next.js side owns <em>what happened</em>. Rules are a pure
          function, state is Postgres.
        </p>

        <div className="eg-table-wrap">
          <table className="cn-table eg-states">
            <caption>
              One document, three states, three live calls to the engine.
            </caption>
            <thead>
              <tr>
                <th scope="col">Client has done</th>
                <th scope="col">Your package</th>
                <th scope="col">The agreement</th>
                <th scope="col">Payment</th>
                <th scope="col">Total</th>
                <th scope="col">Next allowed</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "nothing", r: empty },
                { label: "chosen a package", r: chosen },
                { label: "signed", r: signed },
              ].map(({ label, r }) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {r.blocks.map((b) => (
                    <td key={b.id}>
                      <span className="eg-status" data-status={b.status}>
                        {b.status}
                      </span>
                    </td>
                  ))}
                  <td>{money(r.totals.totalCents, r.currency)}</td>
                  <td>{r.next?.verb ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="eg-p">
          A locked block&apos;s payload is never assembled, so an unsigned client
          receives no invoice lines and no contract prose over the wire. The
          document-level total is still there, because the client chose the
          services that produced it and hiding their own arithmetic from them
          would be theatre rather than security. The gate that actually refuses a
          payment lives in the server action, and it refuses by calling this
          function: the page withholding a payload is necessary and not
          sufficient, because a page is not the only thing that can call a server
          action.
        </p>

        <details className="eg-details">
          <summary>The invoice block, as the wire sees it, before the signature</summary>
          <pre className="eg-pre">
            {JSON.stringify(chosen.blocks.find((b) => b.id === "invoice"), null, 2)}
          </pre>
        </details>

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">Two ways a file can be impossible</h2>
        <p className="eg-p">
          The studio has to describe these differently, because one of them can
          be fixed by dragging blocks around and the other cannot. Telling an
          author the wrong one sends them down a dead end, so the validator
          checks for a cycle first with Kahn&apos;s algorithm and names the
          actual ring; only if the graph is acyclic does it compare the edges
          against document order.
        </p>

        <div className="eg-two">
          <figure className="eg-case">
            <figcaption>A cycle. No order fixes it.</figcaption>
            <p className="eg-mono eg-dim">A waits for C, B waits for A, C waits for B</p>
            {cyclic.problems.map((p, i) => (
              <p key={i} className="eg-verdict" data-severity={p.severity}>
                <code>{p.code}</code> {p.message}
              </p>
            ))}
            <p className="eg-dim">
              No suggested order, because there is no order to suggest.
            </p>
          </figure>

          <figure className="eg-case">
            <figcaption>A forward dependency. Reordering fixes it.</figcaption>
            <p className="eg-mono eg-dim">Payment comes first and waits for the agreement</p>
            {misordered.problems.map((p, i) => (
              <p key={i} className="eg-verdict" data-severity={p.severity}>
                <code>{p.code}</code> {p.message}
              </p>
            ))}
            {misordered.order && (
              <p className="eg-dim">
                Suggested order: <span className="eg-mono">{misordered.order.join(" then ")}</span>
              </p>
            )}
          </figure>
        </div>

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">The ledger, and why a replay is safe</h2>
        <p className="eg-p">
          Payments are append-only. A unique index on{" "}
          <code>(workspace_id, idempotency_key)</code> is the entire guarantee:
          the insert hits the conflict, does nothing, returns no row. There is no
          read-then-write and therefore no window in which two deliveries of one
          webhook both decide they are the first. The balance is a{" "}
          <code>SUM</code> over <code>occurred_at</code>, never a column somebody
          updates, which is why an event that happened earlier but arrived later
          still lands on the right total.
        </p>

        {paid ? (
          <ReplayProof documentId={paid.id} currency={currency} />
        ) : (
          <p className="eg-dim">No paid file in this workspace to replay against.</p>
        )}

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">The queue, and why it is not a cron</h2>
        <p className="eg-p">
          An automation run parks on a <code>resume_at</code> and is claimed by
          whoever asks next. The claim uses the standard Postgres pattern rather
          than a scan, so two workers pull disjoint batches without blocking each
          other. Nothing here actually contends, because the embedded database
          holds one connection, but writing the toy version would teach the wrong
          thing.
        </p>
        <pre className="eg-pre">{`SELECT id, automation_id, document_id, cursor
  FROM automation_runs
 WHERE workspace_id = $1
   AND status = 'waiting'
   AND resume_at <= $2::timestamptz
 ORDER BY resume_at
   FOR UPDATE SKIP LOCKED
 LIMIT $3`}</pre>
        <p className="eg-p">
          The index behind it is partial:{" "}
          <code>(resume_at) WHERE status = &apos;waiting&apos;</code>. Finished
          runs are the overwhelming majority and none of them will ever be due
          again, so there is no reason to carry them in the index the queue reads.
        </p>
        <p className="eg-p">
          A cron asks &quot;what time is it&quot; on a schedule somebody else
          owns. <code>resume_at</code> lets the row say when it wants to be
          looked at, which makes the wait a property of the work rather than of
          the poller. And because that moment is a parameter all the way into the
          Go function, a three-day wait is a button on{" "}
          <a href="/console/automations">the automations page</a> and a
          millisecond in the test suite, by the same mechanism rather than by one
          simulating the other.
        </p>
        <p className="eg-p">
          What it is not is durable execution: no retry with backoff, no
          heartbeat, no cancellation, no versioning of a definition while runs
          are in flight against it. Those are most of the reasons Temporal
          exists. A run that throws is parked with its error rather than retried,
          and saying so is better than implying otherwise.
        </p>

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">The queries, and what Postgres does with them</h2>
        <p className="eg-p">
          No ORM and no query builder. The interesting parts of this schema are
          the parts a builder hides. Each plan below is <code>EXPLAIN ANALYZE</code>{" "}
          run against the database serving this page, a moment ago.
        </p>

        {plans.map((p) => (
          <section key={p.title} className="eg-query">
            <h3 className="eg-h2">{p.title}</h3>
            <p className="eg-p">{p.why}</p>
            <div className="eg-two eg-two--code">
              <pre className="eg-pre">{p.sql}</pre>
              <pre className="eg-pre eg-plan">{p.lines.join("\n")}</pre>
            </div>
          </section>
        ))}

        {/* ---------------------------------------------------------------- */}

        <h2 className="eg-h1">The schema</h2>
        <p className="eg-p">
          A smart file&apos;s <em>definition</em> is a document: an ordered tree
          of blocks whose shape the Go engine owns. Shredding that into tables
          would buy nothing and cost the ability to add a block type without a
          migration, so it lives in one jsonb column. Everything a client{" "}
          <em>does</em> is relational, because that is what gets queried.
        </p>
        <pre className="eg-pre eg-schema">{schema}</pre>

        <p className="sf-note">
          Fictional inventory throughout. No real business, no real client, and
          nothing here implies a commercial relationship with anyone.
        </p>
      </main>
    </div>
  );
}

async function plan(title: string, sql: string, params: unknown[], why: string) {
  let lines: string[];
  try {
    lines = await explain(sql, params);
  } catch (err) {
    // A plan that cannot be produced is worth saying so about, rather than
    // rendering an empty box that looks like the query is free.
    lines = [`EXPLAIN failed: ${err instanceof Error ? err.message : String(err)}`];
  }
  return { title, sql: sql.trim(), why, lines };
}
