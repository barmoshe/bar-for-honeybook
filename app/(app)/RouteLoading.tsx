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
 * sign, pay, with the dot travelling the same order the engine enforces.
 *
 * Everything above the motif is the destination page's own chrome, copied from
 * it exactly, so the swap to real content changes nothing a visitor can see
 * move. That is why the strings live in the table below rather than being
 * passed in per route: one place to keep honest, next to this warning.
 * **If you rename a heading or reorder a nav on one of these pages, change it
 * here too**, or the loading state will visibly rewrite itself on arrival.
 */

/** The three blocks a smart file gates, in the order the engine unlocks them. */
const STEPS = ["Choose", "Sign", "Pay"] as const;

/**
 * Verbatim from each page's own header and title — console/page.tsx,
 * studio/Studio.tsx, engineering/page.tsx — except the `file` row, whose real
 * brand and title are fields of the document still being fetched, so both are
 * stand-ins.
 */
const SURFACES = {
  studio: {
    brand: "Studio",
    eyebrow: "Build a smart file",
    title: "Describe it in a sentence.",
  },
  console: {
    brand: "Console",
    eyebrow: "Your side of the file",
    title: "What the clients did.",
  },
  engineering: {
    brand: "Engineering",
    eyebrow: "How it is built",
    title: "The receipts.",
    // The engineering page narrows its measure; without this the loading block
    // sits on a different left edge than the content that replaces it.
    extraMain: "eg-main",
  },
  automations: {
    brand: "Automations",
    eyebrow: "Triggers, waits, conditions",
    title: "What happens on its own.",
  },
  file: {
    brand: "Smart file",
    eyebrow: "Smart file",
    title: "Opening your file.",
  },
} as const;

type Surface = keyof typeof SURFACES;

/** Each page links to the other two working surfaces, in this order, never to /f. */
const NAV = ["studio", "console", "engineering"] as const;

export default function RouteLoading({ surface }: { surface: Surface }) {
  const page = SURFACES[surface];
  const isFile = surface === "file";
  // The client surface has its own header and a narrower measure than the
  // three operator-facing ones. Both facts follow from this one.
  const shell = isFile ? "sf" : "st";
  const extraMain = "extraMain" in page ? ` ${page.extraMain}` : "";

  return (
    <div className={`hbapp ${shell}`}>
      <header className={`${shell}-top`}>
        <span className="sf-brand">{page.brand}</span>
        {!isFile && (
          <nav className="st-nav">
            {NAV.filter((key) => key !== surface).map((key) => (
              // Nothing is clicked from a loading screen, and an in-viewport
              // Link prefetches by default: two more invocations of the very
              // function this visitor is already waiting on to cold-start.
              <Link key={key} href={`/${key}`} prefetch={false}>
                {SURFACES[key].brand}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className={`${shell}-main${extraMain}`} id="main">
        <p className="sf-eyebrow">{page.eyebrow}</p>
        <h1 className="sf-title">{page.title}</h1>

        <div className="ld-wrap">
          <p className="sf-sr" role="status">
            Loading
          </p>

          <div className="ld-flow" aria-hidden="true">
            <div className="ld-rail">
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
