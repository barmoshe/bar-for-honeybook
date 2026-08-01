import type { Metadata } from "next";
import Link from "next/link";

import AppNav from "@/app/(app)/AppNav";

import { listAutomations, listOutbox, listRuns, runLog, tick } from "@/lib/automations";
import type { Automation, Step } from "@/lib/engine";
import { currentWorkspace } from "@/lib/workspace";

import Clock from "./Clock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Automations",
  robots: { index: false, follow: false },
};

/**
 * Formats a timestamp column.
 *
 * PGlite hands back `Date` objects rather than ISO strings, which the first
 * version of this page did not account for: it sliced `String(value)` and
 * replaced the "T", which turned "Tue Aug 04" into "ue Aug 04" by eating the T
 * in Tue. Going through toISOString makes the shape known before it is cut.
 */
function when(value: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Just the clock part, for a log line whose date is obvious from context. */
function clock(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(11, 16);
}

/** Reads a step back out as the sentence its author meant. */
function describe(step: Step, i: number): string {
  switch (step.kind) {
    case "wait": {
      const h = step.waitHours ?? 0;
      if (h % 24 === 0 && h >= 24) return `wait ${h / 24} day${h === 24 ? "" : "s"}`;
      return `wait ${h} hour${h === 1 ? "" : "s"}`;
    }
    case "email":
      return `email "${step.subject ?? ""}"`;
    case "task":
      return `task "${step.title ?? ""}"`;
    case "stage":
      return `move to ${step.stage}`;
    case "condition": {
      const c = step.if;
      if (!c) return "condition";
      if (c.fact === "total" || c.fact === "balance") {
        const op = c.op === "gt" ? "above" : c.op === "lt" ? "below" : "exactly";
        return `only if ${c.fact} is ${op} ${c.value}`;
      }
      return `only if ${c.fact} is ${c.op === "not" ? "not " : ""}${c.value}`;
    }
    default:
      return `step ${i + 1}`;
  }
}

export default async function Page() {
  const workspace = await currentWorkspace();

  // Advance anything already due on the way in. This is the "ticking on
  // request" the page explains below: no background worker exists on a free
  // plan, so a page load is one of the two things that asks.
  await tick(workspace);

  const [autos, runs, outbox] = await Promise.all([
    listAutomations(workspace),
    listRuns(workspace),
    listOutbox(workspace),
  ]);

  const newest = runs.rows[0];
  const log = newest ? await runLog(newest.id) : null;

  const waiting = runs.rows.filter((r) => r.status === "waiting").length;

  return (
    <div className="hbapp st cn au">
      <AppNav title="Automations" current="/console/automations" />

      <main className="st-main" id="main">
        <p className="sf-eyebrow">Triggers, waits, conditions</p>
        <h1 className="sf-title">What happens on its own.</h1>
        <p className="st-lede">
          A smart file already writes down everything that happens to it, so an
          automation needs no new plumbing: it listens to that same stream, and
          parks itself on a queue until its next step is due. Deciding what the
          next step is happens in the same Go package that decides whether an
          invoice is reachable. Performing it happens here.
        </p>

        <section className="st-pane au-honest">
          <h2 className="st-h2">What this is not</h2>
          <p>
            This is not durable execution. There is no retry with backoff, no
            heartbeat, no cancellation, and no versioning of a definition while
            runs are in flight against it. Those are most of the reasons Temporal
            exists, and their absence is why nobody should run this in
            production. What is here is the shape: a queue of runs, each parked
            on a resume time, advanced by a pure step function.
          </p>
          <p>
            Emails are rows in an outbox. Nothing leaves the building, and the
            outbox below is what &quot;we emailed them&quot; means here.
          </p>
        </section>

        <section className="st-pane">
          <h2 className="st-h2">The clock</h2>
          <p className="cn-note">
            Every wait is measured against a moment passed into the engine rather
            than read from a system clock. That is why a three-day wait can be a
            button here and a millisecond in the test suite: both are the same
            parameter, not one simulating the other.
          </p>
          <Clock />
        </section>

        <section className="st-pane">
          <h2 className="st-h2">Automations</h2>
          <ul className="au-list">
            {autos.rows.map((a) => {
              const def = a.definition as Automation;
              return (
                <li key={a.id} className="au-item">
                  <div className="au-item-head">
                    <strong>{a.name}</strong>
                    <span className="cn-stage" data-stage={a.enabled ? "paid" : undefined}>
                      {a.enabled ? "on" : "off"}
                    </span>
                    <span className="cn-dim">
                      {a.runs} run{a.runs === "1" ? "" : "s"}, {a.waiting} waiting
                    </span>
                  </div>
                  <p className="au-trigger">
                    when a file is <strong>{a.trigger_kind}</strong>
                  </p>
                  <ol className="au-steps">
                    {(def.steps ?? []).map((s, i) => (
                      <li key={i} data-kind={s.kind}>
                        {describe(s, i)}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
            {autos.rows.length === 0 && <li className="cn-dim">None yet.</li>}
          </ul>
        </section>

        <section className="st-pane">
          <h2 className="st-h2">Runs</h2>
          <p className="cn-note">
            One run per automation per file, enforced by a unique index rather
            than by a check in application code, which is what makes a trigger
            that fires twice a no-op. {waiting} of these are parked waiting for a
            time to arrive.
          </p>
          <table className="cn-table">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Automation</th>
                <th scope="col">Status</th>
                <th scope="col">Step</th>
                <th scope="col">Resumes</th>
              </tr>
            </thead>
            <tbody>
              {runs.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/f/${r.token}`}>{r.document_title}</Link>
                    <span className="cn-dim"> {r.client}</span>
                  </th>
                  <td>{r.automation_name}</td>
                  <td>
                    <span className="cn-stage" data-stage={r.status === "done" ? "paid" : undefined}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.cursor} of {r.steps}
                  </td>
                  <td className="cn-dim">
                    {when(r.resume_at)}
                  </td>
                </tr>
              ))}
              {runs.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="cn-dim">
                    Nothing has triggered yet. Sign a file and one appears.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {log && newest && (
          <section className="st-pane">
            <h2 className="st-h2">The newest run, step by step</h2>
            <p className="cn-note">
              {newest.automation_name} on {newest.document_title}.
            </p>
            <ol className="au-log">
              {log.rows.map((entry) => (
                <li key={entry.id} data-kind={entry.kind}>
                  <span className="au-log-kind">{entry.kind}</span>
                  <span className="au-log-detail">
                    {String(
                      (entry.detail?.note as string) ??
                        (entry.detail?.subject as string) ??
                        (entry.detail?.title as string) ??
                        (entry.detail?.stage as string) ??
                        (entry.detail?.trigger as string) ??
                        "",
                    )}
                  </span>
                  <span className="cn-dim">{clock(entry.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="st-pane">
          <h2 className="st-h2">The outbox</h2>
          <p className="cn-note">
            Simulated. A row here is the whole of what sending means in this
            demo, which is worth saying rather than implying a mail server that
            does not exist.
          </p>
          <ul className="au-outbox">
            {outbox.rows.map((m) => (
              <li key={m.id}>
                <div className="au-mail-head">
                  <strong>{m.subject}</strong>
                  <span className="cn-dim">
                    to {m.client} about {m.document_title}
                  </span>
                </div>
                <p>{m.body}</p>
              </li>
            ))}
            {outbox.rows.length === 0 && <li className="cn-dim">Nothing sent yet.</li>}
          </ul>
        </section>

        <p className="sf-note">
          Fictional clients, fictional files, an outbox instead of a mail server.
          The database lives in the running instance and resets when it recycles.
        </p>
      </main>
    </div>
  );
}
