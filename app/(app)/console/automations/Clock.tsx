"use client";

import { useState, useTransition } from "react";

import { advanceClock } from "./actions";
import type { TickResult } from "@/lib/engine";

/**
 * The clock.
 *
 * Every wait in this system is measured against an `asOf` that is passed in
 * rather than read, all the way down to the Go function. So these buttons are
 * not a demo shortcut around a real delay: they are the delay's only input,
 * and the tests use the identical mechanism.
 */
export default function Clock() {
  const [result, setResult] = useState<TickResult | null>(null);
  const [pending, start] = useTransition();

  const jump = (days: number) =>
    start(async () => setResult(await advanceClock(days)));

  return (
    <div className="au-clock">
      <div className="au-clock-buttons">
        <button type="button" className="eg-btn" disabled={pending} onClick={() => jump(0)}>
          Tick now
        </button>
        <button type="button" className="eg-btn" disabled={pending} onClick={() => jump(1)}>
          Jump a day
        </button>
        <button type="button" className="eg-btn" disabled={pending} onClick={() => jump(4)}>
          Jump four days
        </button>
      </div>

      <p className="au-clock-note" aria-live="polite">
        {pending
          ? "Asking the runner what is due..."
          : result
            ? `Claimed ${result.claimed}, advanced ${result.advanced}, performed ${result.actions} action${result.actions === 1 ? "" : "s"}, as of ${result.asOf.slice(0, 16).replace("T", " ")}.`
            : "Runs advance when someone asks. There is no background worker on a free plan, so this is that ask."}
      </p>
    </div>
  );
}
