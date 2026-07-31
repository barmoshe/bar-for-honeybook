"use client";

import { useState, useTransition } from "react";

import { money, type Resolved, type ResolvedBlock, type SmartFileDoc } from "@/lib/engine";

import {
  answerQuestion,
  bookSlot,
  payNow,
  signContract,
  toggleService,
} from "./actions";

/**
 * The client's view of a smart file.
 *
 * Everything visible here came from the Go engine on the server. This component
 * decides nothing: it does not compute a total, does not work out whether a
 * block is reachable, and does not know the gating rules. It renders a decision
 * and sends back an intent.
 *
 * That is why an action can be trusted to be the only gate. If this component
 * could derive "the invoice is open", there would be two answers to that
 * question and eventually they would differ.
 */
export default function SmartFileView({
  token,
  doc,
  resolved,
}: {
  token: string;
  doc: SmartFileDoc;
  resolved: Resolved;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not work.");
    });
  };

  const currency = resolved.currency;
  const done = resolved.blocks.filter((b) => b.status === "complete").length;

  return (
    <div className="hbapp sf" data-pending={pending || undefined}>
      <header className="sf-top">
        <span className="sf-brand">{doc.business}</span>
        <span className="sf-for">for {doc.client}</span>
      </header>

      <main className="sf-main" id="main">
        <p className="sf-eyebrow">Smart file</p>
        <h1 className="sf-title">{doc.title}</h1>

        <ol className="sf-progress" aria-label="Progress through this file">
          {resolved.blocks.map((b) => (
            <li
              key={b.id}
              className="sf-pip"
              data-status={b.status}
              aria-current={resolved.next?.blockId === b.id ? "step" : undefined}
            >
              <span className="sf-pip-dot" aria-hidden="true" />
              <span className="sf-pip-label">{b.title}</span>
            </li>
          ))}
        </ol>
        <p className="sf-progress-count">
          {done} of {resolved.blocks.length} done
        </p>

        {error && (
          <p className="sf-error" role="alert">
            {error}
          </p>
        )}

        <div className="sf-blocks">
          {resolved.blocks.map((block) => (
            <Block
              key={block.id}
              block={block}
              token={token}
              currency={currency}
              pending={pending}
              run={run}
            />
          ))}
        </div>

        <p className="sf-note">
          This file is a working demo. Nothing is charged, no card is taken, and
          the payment step writes to a ledger rather than to a gateway. The
          database is embedded in the running instance, so a signature survives
          until that instance recycles and no longer.
        </p>
      </main>

      <div className="sf-bar" role="status">
        <div className="sf-bar-total">
          <span className="sf-bar-label">
            {resolved.totals.paidCents > 0 ? "Balance" : "Total"}
          </span>
          <strong className="sf-bar-amount">
            {money(
              resolved.totals.paidCents > 0
                ? resolved.totals.balanceCents
                : resolved.totals.totalCents,
              currency,
            )}
          </strong>
        </div>
        <p className="sf-bar-next">
          {resolved.complete ? "All done. Thank you." : (resolved.next?.label ?? "Nothing to do yet.")}
        </p>
      </div>
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

function Block({
  block,
  token,
  currency,
  pending,
  run,
}: {
  block: ResolvedBlock;
  token: string;
  currency: string;
  pending: boolean;
  run: RunFn;
}) {
  return (
    <section className="sf-block" data-status={block.status} data-kind={block.kind}>
      <header className="sf-block-head">
        <h2 className="sf-block-title">{block.title}</h2>
        <span className="sf-badge" data-status={block.status}>
          {block.status === "complete"
            ? "Done"
            : block.status === "locked"
              ? "Locked"
              : "Your turn"}
        </span>
      </header>

      {block.status === "locked" ? (
        <p className="sf-locked">{block.lockReason}</p>
      ) : (
        <BlockBody
          block={block}
          token={token}
          currency={currency}
          pending={pending}
          run={run}
        />
      )}
    </section>
  );
}

function BlockBody({
  block,
  token,
  currency,
  pending,
  run,
}: {
  block: ResolvedBlock;
  token: string;
  currency: string;
  pending: boolean;
  run: RunFn;
}) {
  if (block.services) {
    const single = block.services.mode === "single";
    return (
      <ul className="sf-options">
        {block.services.options.map((opt) => {
          const max = opt.maxQty && opt.maxQty > 0 ? opt.maxQty : 1;
          return (
            <li key={opt.id} className="sf-option" data-chosen={opt.chosen || undefined}>
              <button
                type="button"
                className="sf-option-main"
                disabled={pending}
                aria-pressed={opt.chosen}
                onClick={() =>
                  run(() =>
                    toggleService(token, block.id, opt.id, opt.chosen && !single ? 0 : 1),
                  )
                }
              >
                <span className="sf-check" aria-hidden="true" data-on={opt.chosen || undefined} />
                <span className="sf-option-text">
                  <span className="sf-option-name">{opt.name}</span>
                  {opt.blurb && <span className="sf-option-blurb">{opt.blurb}</span>}
                </span>
                <span className="sf-option-price">{money(opt.priceCents, currency)}</span>
              </button>

              {opt.chosen && max > 1 && (
                <div className="sf-qty">
                  <button
                    type="button"
                    disabled={pending || opt.qty <= 1}
                    aria-label={`One fewer ${opt.name}`}
                    onClick={() => run(() => toggleService(token, block.id, opt.id, opt.qty - 1))}
                  >
                    &minus;
                  </button>
                  <span aria-live="polite">{opt.qty}</span>
                  <button
                    type="button"
                    disabled={pending || opt.qty >= max}
                    aria-label={`One more ${opt.name}`}
                    onClick={() => run(() => toggleService(token, block.id, opt.id, opt.qty + 1))}
                  >
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (block.contract) {
    return <ContractBody block={block} token={token} pending={pending} run={run} />;
  }

  if (block.invoice) {
    const inv = block.invoice;
    return (
      <div className="sf-invoice">
        <table className="sf-lines">
          <caption className="sf-sr">Invoice lines</caption>
          <tbody>
            {inv.lines.map((line, i) => (
              <tr key={`${line.label}-${i}`}>
                <th scope="row">
                  {line.label}
                  {line.qty > 1 && <span className="sf-x"> &times;{line.qty}</span>}
                </th>
                <td>{money(line.amountCents, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Subtotal</th>
              <td>{money(inv.subtotalCents, currency)}</td>
            </tr>
            {inv.taxCents > 0 && (
              <tr>
                <th scope="row">Tax</th>
                <td>{money(inv.taxCents, currency)}</td>
              </tr>
            )}
            <tr className="sf-lines-total">
              <th scope="row">Total</th>
              <td>{money(inv.totalCents, currency)}</td>
            </tr>
            {inv.paidCents > 0 && (
              <tr>
                <th scope="row">Paid</th>
                <td>&minus;{money(inv.paidCents, currency)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {inv.dueNowCents > 0 ? (
          <>
            <button
              type="button"
              className="sf-pay"
              disabled={pending}
              onClick={() => run(() => payNow(token, block.id))}
            >
              Pay {money(inv.dueNowCents, currency)}
            </button>
            <p className="sf-fineprint">
              {inv.depositDueCents < inv.totalCents && inv.paidCents === 0
                ? `A deposit of ${money(inv.depositDueCents, currency)} reserves the date. The balance follows on delivery.`
                : "Simulated. Press it twice if you like; the ledger takes it once."}
            </p>
          </>
        ) : (
          <p className="sf-paid">Paid in full. Thank you.</p>
        )}
      </div>
    );
  }

  if (block.questionnaire) {
    return (
      <ul className="sf-questions">
        {block.questionnaire.questions.map((q) => (
          <li key={q.id} className="sf-question">
            <label className="sf-label" htmlFor={`${block.id}-${q.id}`}>
              {q.prompt}
              {q.required && <span className="sf-req"> (required)</span>}
            </label>
            {q.kind === "choice" ? (
              <select
                id={`${block.id}-${q.id}`}
                defaultValue={q.answer ?? ""}
                disabled={pending}
                onChange={(e) =>
                  run(() => answerQuestion(token, block.id, q.id, e.target.value))
                }
              >
                <option value="">Choose one</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${block.id}-${q.id}`}
                type="text"
                defaultValue={q.answer ?? ""}
                disabled={pending}
                onBlur={(e) => {
                  if (e.target.value !== (q.answer ?? "")) {
                    run(() => answerQuestion(token, block.id, q.id, e.target.value));
                  }
                }}
              />
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (block.scheduler) {
    return (
      <ul className="sf-slots">
        {block.scheduler.slots.map((slot) => (
          <li key={slot.id}>
            <button
              type="button"
              className="sf-slot"
              disabled={pending}
              aria-pressed={block.scheduler?.booked === slot.id}
              data-on={block.scheduler?.booked === slot.id || undefined}
              onClick={() => run(() => bookSlot(token, block.id, slot.id))}
            >
              <span className="sf-slot-when">{slot.startsAt}</span>
              <span className="sf-slot-len">{slot.durationMin} min</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

function ContractBody({
  block,
  token,
  pending,
  run,
}: {
  block: ResolvedBlock;
  token: string;
  pending: boolean;
  run: RunFn;
}) {
  const [name, setName] = useState("");
  const contract = block.contract!;

  return (
    <div className="sf-contract">
      {/* The body arrives already interpolated, so what is read here is what
          the invoice charges. Split on blank lines rather than rendering HTML:
          nothing about a contract needs markup, and not accepting any is the
          cheapest way to never render someone else's. */}
      {contract.body.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="sf-para">
          {para}
        </p>
      ))}

      {contract.signed ? (
        <p className="sf-signed">
          Signed by <strong>{contract.signature}</strong>
        </p>
      ) : contract.signatureRequired ? (
        <form
          className="sf-sign"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => signContract(token, block.id, name));
          }}
        >
          <label className="sf-label" htmlFor={`${block.id}-sign`}>
            Type your full name to sign
          </label>
          <div className="sf-sign-row">
            <input
              id={`${block.id}-sign`}
              className="sf-sign-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={pending}
            />
            <button type="submit" className="sf-sign-btn" disabled={pending || name.trim().length < 2}>
              Sign
            </button>
          </div>
        </form>
      ) : (
        <p className="sf-fineprint">No signature needed on this one.</p>
      )}
    </div>
  );
}
