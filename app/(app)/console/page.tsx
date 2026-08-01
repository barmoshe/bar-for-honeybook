import type { Metadata } from "next";
import Link from "next/link";

import AppNav from "@/app/(app)/AppNav";

import { listRuns } from "@/lib/automations";
import * as db from "@/lib/db/queries";
import { money } from "@/lib/engine";
import { currentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false },
};

const STAGES = ["sent", "opened", "selected", "signed", "paid"] as const;

export default async function Page() {
  const workspace = await currentWorkspace();

  // Six independent reads, issued together. PGlite holds one connection so they
  // queue behind each other anyway, but writing it as a waterfall would bake in
  // a shape that gets slower the moment this points at a real Postgres.
  const [files, revenue, ranking, steps, tts, runs] = await Promise.all([
    db.documentSummaries(workspace),
    db.monthlyRevenue(workspace),
    db.serviceRanking(workspace),
    db.funnel(workspace),
    db.timeToSign(workspace),
    listRuns(workspace, 5),
  ]);

  const currency = files.rows[0]?.currency ?? "USD";
  const total = revenue.rows.reduce((n, r) => n + Number(r.revenue_cents), 0);
  const peak = Math.max(1, ...revenue.rows.map((r) => Number(r.revenue_cents)));
  const sent = Number(steps.rows.find((s) => s.step === "sent")?.n ?? 0);

  return (
    <div className="hbapp st cn">
      <AppNav title="Console" current="/console" />

      <main className="st-main" id="main">
        <p className="sf-eyebrow">Your side of the file</p>
        <h1 className="sf-title">What the clients did.</h1>
        <p className="st-lede">
          Every number here is one SQL statement against the embedded Postgres,
          written by hand. The interesting ones are noted where they sit, and
          the whole set is shown beside its query plan on{" "}
          <Link href="/engineering">the engineering page</Link>.
        </p>

        <section className="cn-stats" aria-label="Headline numbers">
          <Stat label="Collected" value={money(total, currency)} note="across every file" />
          <Stat label="Files" value={String(sent)} note="in this workspace" />
          <Stat
            label="Median time to sign"
            value={tts?.median_hours ? `${tts.median_hours}h` : "n/a"}
            note={tts?.p90_hours ? `90th percentile ${tts.p90_hours}h` : ""}
          />
        </section>

        <section className="st-pane cn-autos">
          <h2 className="st-h2">
            Automations <Link href="/console/automations">open</Link>
          </h2>
          <p className="cn-note">
            Runs listening to the same event stream this page reports on. They
            park on a queue until their next step is due.
          </p>
          <ul className="cn-runs">
            {runs.rows.map((r) => (
              <li key={r.id}>
                <span className="cn-stage" data-stage={r.status === "done" ? "paid" : undefined}>
                  {r.status}
                </span>
                <span>{r.automation_name}</span>
                <span className="cn-dim">
                  {r.document_title}, step {r.cursor} of {r.steps}
                </span>
              </li>
            ))}
            {runs.rows.length === 0 && (
              <li className="cn-dim">Nothing triggered yet. Sign a file and one appears.</li>
            )}
          </ul>
        </section>

        <div className="st-grid">
          <section className="st-pane">
            <h2 className="st-h2">Revenue by month</h2>
            <p className="cn-note">
              Three window functions over one scan: a running total, the previous
              month, and the change between them. The first month has no
              previous month, and NULLIF keeps that an absent value rather than a
              division by zero.
            </p>
            <table className="cn-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Collected</th>
                  <th scope="col">Running</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {revenue.rows.map((r) => (
                  <tr key={r.month}>
                    <th scope="row">{r.month}</th>
                    <td>
                      <span
                        className="cn-bar"
                        style={{ "--w": `${(Number(r.revenue_cents) / peak) * 100}%` } as React.CSSProperties}
                      />
                      {money(Number(r.revenue_cents), currency)}
                    </td>
                    <td>{money(Number(r.running_cents), currency)}</td>
                    <td data-dir={changeDir(r.change_bps)}>
                      {r.change_bps === null ? "—" : formatBps(r.change_bps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="st-pane">
            <h2 className="st-h2">What sells</h2>
            <p className="cn-note">
              The price of an option lives inside the document&apos;s jsonb block
              tree, so this cross-references relational selections against a
              document-shaped catalogue with jsonb_array_elements in a LATERAL
              join. Still one query.
            </p>
            <table className="cn-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Service</th>
                  <th scope="col">Chosen</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {ranking.rows.map((r) => (
                  <tr key={r.option_id}>
                    <th scope="row">{r.rank}</th>
                    <td>{r.name}</td>
                    <td>{r.times_chosen}</td>
                    <td>{money(Number(r.revenue_cents), currency)}</td>
                    <td>{(Number(r.share_bps) / 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="st-pane cn-funnel-pane">
          <h2 className="st-h2">The funnel</h2>
          <p className="cn-note">
            Counted with FILTER in a single pass rather than five separate
            queries, so every step is measured against the same snapshot. Five
            queries against a live table can report more signatures than files,
            which is the sort of number that ends a dashboard&apos;s career.
          </p>
          <ol className="cn-funnel">
            {STAGES.map((stage) => {
              const row = steps.rows.find((s) => s.step === stage);
              const n = Number(row?.n ?? 0);
              const pct = Number(row?.of_sent_bps ?? 0) / 100;
              return (
                <li key={stage}>
                  <span className="cn-funnel-label">{stage}</span>
                  <span className="cn-funnel-track">
                    <span className="cn-funnel-fill" style={{ "--w": `${pct}%` } as React.CSSProperties} />
                  </span>
                  <span className="cn-funnel-n">
                    {n} <span className="cn-dim">{pct.toFixed(0)}%</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="st-pane">
          <h2 className="st-h2">Files</h2>
          <p className="cn-note">
            One statement. The four aggregates hang off LEFT JOIN LATERAL
            subqueries rather than a shared GROUP BY, because aggregating over
            four tables at once multiplies their rows against each other and
            inflates the money.
          </p>
          <table className="cn-table cn-files">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Client</th>
                <th scope="col">Stage</th>
                <th scope="col">Collected</th>
                <th scope="col">Opened</th>
              </tr>
            </thead>
            <tbody>
              {files.rows.map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    <Link href={`/f/${f.token}`}>{f.title}</Link>
                  </th>
                  <td>{f.client}</td>
                  <td>
                    <span className="cn-stage" data-stage={f.stage}>
                      {f.stage}
                    </span>
                  </td>
                  <td>{money(Number(f.paid_cents), f.currency)}</td>
                  <td className="cn-dim">{new Date(f.created_at).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="sf-note">
          Fictional inventory in a workspace of your own. The database lives in
          the running instance, so these rows are seeded on first arrival and go
          away when that instance recycles. The seed is deterministic, so they
          come back looking the same.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="cn-stat">
      <span className="cn-stat-label">{label}</span>
      <strong className="cn-stat-value">{value}</strong>
      {note && <span className="cn-stat-note">{note}</span>}
    </div>
  );
}

function changeDir(bps: string | null): "up" | "down" | "flat" {
  if (bps === null) return "flat";
  const n = Number(bps);
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

function formatBps(bps: string): string {
  const pct = Number(bps) / 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}
