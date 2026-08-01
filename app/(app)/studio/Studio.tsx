"use client";


import AppNav from "@/app/(app)/AppNav";
import { useEffect, useMemo, useState, useTransition } from "react";

import { money, type Validation } from "@/lib/engine";
import { parseBrief } from "@/lib/parser";

import { createFile, validateDraft } from "./actions";

/**
 * The studio: describe a file in a sentence, watch it get built.
 *
 * The derivation on the right is the point. Anything can produce a document
 * from a sentence; what is worth showing is *which words produced which block*,
 * and what was left over. The parser is rules rather than a model precisely so
 * that this panel can exist and be true.
 *
 * Parsing runs here, in the browser, on every keystroke: no key, no network, no
 * spinner. Validation runs on the server, because that is the Go engine's job
 * and it stays the only thing allowed to answer it.
 */

const EXAMPLES = [
  "photography package, two tiers, contract before payment, 50% deposit",
  "branding session with add-ons, intake questionnaire, terms to sign before paying, 25% deposit, 17% VAT, then book a call",
  "coaching retainer, $2,400, signed agreement, then they pay",
  "just a contract to sign, nothing else",
];

export default function Studio() {
  const [brief, setBrief] = useState(EXAMPLES[0]);
  const [business, setBusiness] = useState("Northlight Studio");
  const [client, setClient] = useState("Dana");
  // Validation is tagged with the document it judged. Clearing it when the
  // draft changes would mean writing state during a render pass; letting a
  // stale verdict linger would mean showing a judgement of a document that is
  // no longer on screen. Keying it does neither.
  const [judged, setJudged] = useState<{ key: string; value: Validation } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();

  // Pure, synchronous, and cheap enough to run on every keystroke.
  const derivation = useMemo(
    () => parseBrief(brief, { id: "doc_draft", business, client }),
    [brief, business, client],
  );

  const doc = derivation.document;
  const docKey = useMemo(() => (doc ? JSON.stringify(doc) : ""), [doc]);

  // Validation is a round trip, so it waits for a pause in typing. The delay is
  // long enough to not chase every keystroke and short enough that a finished
  // sentence is judged before you look up.
  useEffect(() => {
    if (!doc) return;
    let live = true;
    const t = setTimeout(() => {
      validateDraft(doc)
        .then((v) => live && setJudged({ key: docKey, value: v }))
        .catch(() => {});
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [doc, docKey]);

  const validation = judged?.key === docKey ? judged.value : null;
  const errors = validation?.problems.filter((p) => p.severity === "error") ?? [];
  const warnings = validation?.problems.filter((p) => p.severity === "warning") ?? [];

  return (
    <div className="hbapp st">
      <AppNav title="Studio" current="/studio" />

      <main className="st-main" id="main">
        <p className="sf-eyebrow">Build a smart file</p>
        <h1 className="sf-title">Describe it in a sentence.</h1>
        <p className="st-lede">
          A parser reads the brief and assembles the file. Every phrase it
          recognises is highlighted, and everything it does with that phrase is
          listed beside it. Nothing here calls a model, which is why it answers
          before you finish typing and why it can show you its work at all.
        </p>

        <div className="st-grid">
          <section className="st-pane">
            <label className="sf-label" htmlFor="brief">
              The brief
            </label>
            <textarea
              id="brief"
              className="st-brief"
              value={brief}
              rows={3}
              onChange={(e) => setBrief(e.target.value)}
              spellCheck={false}
            />

            <ul className="st-examples">
              {EXAMPLES.map((ex, i) => (
                <li key={ex}>
                  <button type="button" className="st-chip" onClick={() => setBrief(ex)}>
                    Example {i + 1}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="st-chip" onClick={() => setBrief("")}>
                  Clear
                </button>
              </li>
            </ul>

            <div className="st-meta">
              <div>
                <label className="sf-label" htmlFor="business">
                  Business
                </label>
                <input id="business" type="text" value={business} onChange={(e) => setBusiness(e.target.value)} />
              </div>
              <div>
                <label className="sf-label" htmlFor="client">
                  Client
                </label>
                <input id="client" type="text" value={client} onChange={(e) => setClient(e.target.value)} />
              </div>
            </div>

            <h2 className="st-h2">What it read</h2>
            <p className="st-marked" aria-label="The brief with recognised phrases highlighted">
              {highlight(brief, derivation)}
            </p>

            {derivation.findings.length > 0 && (
              <ol className="st-findings">
                {derivation.findings.map((f, i) => (
                  <li key={`${f.rule}-${i}`} className="st-finding">
                    {f.spans.map((sp, j) => (
                      <code key={j} className="st-phrase">
                        {sp.text}
                      </code>
                    ))}
                    <span className="st-arrow" aria-hidden="true">
                      &rarr;
                    </span>
                    <span className="st-intent">{f.intent}</span>
                    <span className="st-arrow" aria-hidden="true">
                      &rarr;
                    </span>
                    <code className="st-effect">{f.effect}</code>
                  </li>
                ))}
              </ol>
            )}

            {derivation.unmatched.length > 0 && (
              <div className="st-unmatched">
                <h3 className="st-h3">Not understood</h3>
                <ul>
                  {derivation.unmatched.map((u, i) => (
                    <li key={i}>{u.text}</li>
                  ))}
                </ul>
                <p className="sf-fineprint">
                  Left in the brief and out of the file. A parser that quietly
                  dropped these would be harder to trust than one that admits
                  them.
                </p>
              </div>
            )}
          </section>

          <section className="st-pane">
            <h2 className="st-h2">What it built</h2>

            {!doc ? (
              <div className="st-empty">
                {derivation.problems.length > 0 ? (
                  derivation.problems.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p>Write a brief and the file appears here.</p>
                )}
              </div>
            ) : (
              <>
                <ol className="st-blocks">
                  {doc.blocks.map((b, i) => (
                    <li key={b.id} className="st-block" data-kind={b.kind}>
                      <div className="st-block-head">
                        <span className="st-step">{i + 1}</span>
                        <strong>{b.title}</strong>
                        <span className="st-kind">{b.kind}</span>
                        {!b.required && <span className="st-optional">optional</span>}
                      </div>

                      {b.requiresComplete?.length ? (
                        <p className="st-gate">
                          waits for{" "}
                          {b.requiresComplete
                            .map((id) => doc.blocks.find((x) => x.id === id)?.title ?? id)
                            .join(" and ")}
                          <span className="st-because">
                            {derivation.edges.find((e) => e.from === b.id)?.because}
                          </span>
                        </p>
                      ) : null}

                      {b.services && (
                        <ul className="st-opts">
                          {b.services.options.map((o) => (
                            <li key={o.id}>
                              <span>{o.name}</span>
                              <span className="st-price">{money(o.priceCents, doc.currency)}</span>
                            </li>
                          ))}
                          <li className="st-mode">
                            {b.services.mode === "single" ? "pick one" : "pick any"}
                          </li>
                        </ul>
                      )}

                      {b.contract && (
                        <p className="st-detail">
                          {b.contract.signatureRequired ? "signature required" : "no signature"}
                          {", "}
                          {(b.contract.body.match(/\{\{/g) ?? []).length} values pulled from the invoice
                        </p>
                      )}

                      {b.invoice && (
                        <p className="st-detail">
                          {b.invoice.depositBps > 0
                            ? `${b.invoice.depositBps / 100}% deposit`
                            : "paid in full"}
                          {b.invoice.taxBps > 0 ? `, ${b.invoice.taxBps / 100}% tax` : ", no tax"}
                        </p>
                      )}

                      {b.questionnaire && (
                        <p className="st-detail">{b.questionnaire.questions.length} questions</p>
                      )}

                      {b.scheduler && <p className="st-detail">{b.scheduler.slots.length} times offered</p>}
                    </li>
                  ))}
                </ol>

                <div className="st-verdict" data-state={errors.length ? "bad" : validation ? "good" : "pending"}>
                  {!validation ? (
                    <p>Checking with the engine...</p>
                  ) : errors.length ? (
                    <>
                      <h3 className="st-h3">The engine refuses this</h3>
                      <ul>
                        {errors.map((p, i) => (
                          <li key={i}>{p.message}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>
                      <strong>A client can complete this file.</strong> The gating graph has no
                      cycle and every step is reachable in order.
                    </p>
                  )}

                  {warnings.length > 0 && (
                    <>
                      <h3 className="st-h3">Worth a look</h3>
                      <ul className="st-warnings">
                        {warnings.map((p, i) => (
                          <li key={i}>{p.message}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {derivation.problems.map((p, i) => (
                  <p key={i} className="sf-fineprint">
                    {p}
                  </p>
                ))}

                {error && (
                  <p className="sf-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="sf-pay st-create"
                  disabled={creating || errors.length > 0}
                  onClick={() => {
                    setError(null);
                    startCreating(async () => {
                      const res = await createFile(brief, { business, client });
                      if (res && !res.ok) setError(res.error);
                    });
                  }}
                >
                  {creating ? "Creating..." : "Create it and open the client link"}
                </button>
                <p className="sf-fineprint">
                  The server re-parses the brief rather than trusting this
                  preview, so what gets saved is always something the parser
                  would have produced.
                </p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** Renders the brief with each matched span wrapped, so the highlighting and
 *  the findings list cannot disagree: both read the same spans. */
function highlight(input: string, derivation: ReturnType<typeof parseBrief>) {
  if (!input) return <span className="st-dim">Nothing yet.</span>;

  const marks = [
    ...derivation.findings.flatMap((f) =>
      f.spans.map((sp) => ({ ...sp, kind: "hit" as const, rule: f.rule })),
    ),
    ...derivation.unmatched.map((u) => ({ ...u, kind: "miss" as const, rule: "" })),
  ].sort((a, b) => a.start - b.start);

  const out: React.ReactNode[] = [];
  let cursor = 0;

  marks.forEach((m, i) => {
    if (m.start > cursor) out.push(<span key={`t${i}`}>{input.slice(cursor, m.start)}</span>);
    out.push(
      <mark key={`m${i}`} className="st-mark" data-kind={m.kind} title={m.rule || "not understood"}>
        {input.slice(m.start, m.end)}
      </mark>,
    );
    cursor = Math.max(cursor, m.end);
  });

  if (cursor < input.length) out.push(<span key="tail">{input.slice(cursor)}</span>);
  return out;
}
