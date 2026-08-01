import Link from "next/link";

/**
 * What every working surface shows while its server render is in flight.
 *
 * These pages are all `force-dynamic`, and on a cold instance the render waits
 * on PGlite booting from nothing, the workspace seeding itself, and (on /f and
 * /engineering) an HTTP call into the Go function, which has its own cold
 * start. Without a loading state the browser simply sits on the previous page
 * with no sign that anything is happening.
 *
 * The motif is the demo's own gating sequence rather than a spinner: choose,
 * sign, pay, with the dot travelling the same order the engine enforces. The
 * header and the title are the route's real ones, so when the content lands
 * nothing above it moves.
 *
 * All the motion is CSS, deliberately. The reduced-motion rule at the bottom of
 * app.css flattens animation-duration under .hbapp, which catches this and
 * would not catch SVG animateMotion. Every animation here is written so its
 * final keyframe is a sensible still frame: the dot resting on the last node
 * with all three lit.
 */

/** The three blocks a smart file gates, in the order the engine unlocks them. */
const STEPS = ["Choose", "Sign", "Pay"] as const;

export default function RouteLoading({
  eyebrow,
  title,
  chrome = "app",
}: {
  eyebrow: string;
  title: string;
  /** "file" matches the client surface, which has its own header and measure. */
  chrome?: "app" | "file";
}) {
  const isFile = chrome === "file";

  return (
    <div className={`hbapp ld ${isFile ? "sf" : "st"}`}>
      {isFile ? (
        <header className="sf-top">
          <span className="sf-brand">Smart file</span>
        </header>
      ) : (
        <header className="st-top">
          <span className="sf-brand">Smart files</span>
          <nav className="st-nav" aria-label="The working surfaces">
            <Link href="/f">The file</Link>
            <Link href="/studio">Studio</Link>
            <Link href="/console">Console</Link>
            <Link href="/engineering">Engineering</Link>
          </nav>
        </header>
      )}

      <main className={isFile ? "sf-main" : "st-main"} id="main">
        <p className="sf-eyebrow">{eyebrow}</p>
        <h1 className="sf-title">{title}</h1>

        <div className="ld-wrap">
          <p className="sf-sr" role="status">
            Loading
          </p>

          <div className="ld-flow" aria-hidden="true">
            <div className="ld-rail">
              <span className="ld-rail-line" />
              {STEPS.map((step, i) => (
                <span
                  key={step}
                  className="ld-node"
                  style={{ "--i": i } as React.CSSProperties}
                />
              ))}
              {/* Last, so it passes over the nodes rather than under them. */}
              <span className="ld-dot" />
            </div>
            <ol className="ld-steps">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <p className="ld-note">
            Cold starts take a moment: the database lives inside the function
            and seeds itself from nothing.
          </p>
        </div>
      </main>
    </div>
  );
}
