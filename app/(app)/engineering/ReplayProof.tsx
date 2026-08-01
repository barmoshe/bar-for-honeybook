"use client";

import { useState, useTransition } from "react";

import { money } from "@/lib/engine";

import { replayOutOfOrder, replayPayment, type ReplayResult } from "./actions";

/**
 * The ledger's two claims, wired to buttons.
 *
 * Both run against the real table in your own workspace. Nothing is faked and
 * nothing is reset afterwards, which is the point: a proof you can press is
 * worth more than a paragraph asserting the same thing.
 */
export default function ReplayProof({
  documentId,
  currency,
}: {
  documentId: string;
  currency: string;
}) {
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ReplayResult>) =>
    start(async () => setResult(await fn()));

  return (
    <div className="eg-proof">
      <div className="eg-proof-buttons">
        <button
          type="button"
          className="eg-btn"
          disabled={pending}
          onClick={() => run(() => replayPayment(documentId))}
        >
          Deliver the same webhook again
        </button>
        <button
          type="button"
          className="eg-btn"
          disabled={pending}
          onClick={() => run(() => replayOutOfOrder(documentId))}
        >
          Deliver one nine days late
        </button>
      </div>

      {result && (
        <dl className="eg-proof-out" aria-live="polite">
          <div>
            <dt>Key</dt>
            <dd className="eg-mono eg-wrap">{result.key}</dd>
          </div>
          <div>
            <dt>Row written</dt>
            <dd>{result.applied ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt>Balance</dt>
            <dd>
              {money(result.beforeCents, currency)}
              {" → "}
              <strong>{money(result.afterCents, currency)}</strong>
            </dd>
          </div>
          <div>
            <dt>Ledger rows</dt>
            <dd>{result.entries}</dd>
          </div>
          <div className="eg-proof-note">
            <dt className="sf-sr">Result</dt>
            <dd>{result.note}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
