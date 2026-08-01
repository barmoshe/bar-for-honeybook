/**
 * Two pictures that replace about four hundred words of prose.
 *
 * Both are drawn from the running system rather than from an idea of it. The
 * block titles are the ones in lib/db/seed-workspace.sql, so what is drawn here
 * is what /f renders; the states are the engine's own three (locked, open,
 * complete, engine/doc.go); and the split in the second diagram is the real
 * one, between a Go package that decides and a database that remembers.
 *
 * HTML and CSS rather than SVG: the boxes carry real text that scales with the
 * type ramp, the layout reflows to one column on a phone without a second
 * viewBox, and the connectors are pseudo-elements that turn with it.
 *
 * The motion follows the rule the loading state arrived at: the base rules are
 * the resting frame, the keyframes fill backwards from a 0% that undoes it, and
 * reduced motion switches the animation off to reveal exactly that frame — here
 * a finished file, every block complete.
 */

/** Verbatim from the seeded documents, so the picture matches /f. */
const BLOCKS = [
  { title: "Your package", kind: "services", gate: null },
  { title: "The agreement", kind: "contract", gate: "waits for" },
  { title: "Payment", kind: "invoice", gate: "waits for" },
] as const;

/** What the request actually touches, in order. */
const STAGES = [
  { name: "The page", note: "Next server component" },
  { name: "The engine", note: "Go, no I/O" },
  { name: "The database", note: "Postgres in WASM" },
] as const;

export function DocumentDiagram() {
  return (
    <figure className="sfd">
      <div
        className="sfd-doc"
        role="img"
        aria-label="Three blocks in a row: Your package, then The agreement, which waits for it, then Payment, which waits for the agreement. Each unlocks only when the one before it is complete."
      >
        {BLOCKS.map((b, i) => (
          <div className="sfd-block" key={b.kind} style={{ "--i": i } as React.CSSProperties}>
            {b.gate && <span className="sfd-edge" aria-hidden="true" />}
            <span className="sfd-kind">{b.kind}</span>
            <span className="sfd-title">{b.title}</span>
            <span className="sfd-state" aria-hidden="true" />
          </div>
        ))}
      </div>
      <figcaption className="sfd-cap">
        A file is a graph, not a form. Each block names the blocks it waits for,
        so the lock falls out of the graph instead of being written by hand.
      </figcaption>
    </figure>
  );
}

export function SystemDiagram() {
  return (
    <figure className="sfd">
      <div
        className="sfd-sys"
        role="img"
        aria-label="A request goes from the page to the Go engine, which decides what is allowed, and to Postgres running in WebAssembly, which records what happened."
      >
        {STAGES.map((s, i) => (
          <div className="sfd-stage" key={s.name} style={{ "--i": i } as React.CSSProperties}>
            {i > 0 && <span className="sfd-edge" aria-hidden="true" />}
            <span className="sfd-pulse" aria-hidden="true" />
            <span className="sfd-stage-n">{s.name}</span>
            <span className="sfd-stage-note">{s.note}</span>
          </div>
        ))}
      </div>
      <figcaption className="sfd-cap">
        The engine answers what is allowed and touches nothing; the database
        records what happened and decides nothing. Keeping those apart is why
        the rules can be tested with no database running.
      </figcaption>
    </figure>
  );
}
