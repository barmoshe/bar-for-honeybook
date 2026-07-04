import type { CSSProperties } from "react";

/** Stroke icons for the "Where I'd plug in" idea cards. Color via `color` (currentColor). */
export function IdeaIcon({ kind }: { kind: "agent" | "evals" | "docgen" }) {
  if (kind === "agent") {
    // three flow nodes joined by a thread — echoes the hero clientflow graphic
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="8" cy="36" r="4.5" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="12" r="4.5" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="40" cy="36" r="4.5" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M11 32.5c4-4 7.5-11.5 10-16.5M27 16c2.5 5 6 12.5 10 16.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 6"
        />
      </svg>
    );
  }
  if (kind === "evals") {
    // checklist card: two rows, both passing
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="7" y="8" width="34" height="32" rx="7" stroke="currentColor" strokeWidth="2.5" />
        <path d="m14 19 3.2 3.2L23 16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 20h7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m14 31 3.2 3.2L23 28.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 32h7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  // docgen: page with folded corner + an AI sparkle
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M15 6h13l9 9v25a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M28 6v9h9" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M19 27h12M19 33h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M22 15c.5 2.8 1.9 4.2 4.7 4.7-2.8.5-4.2 1.9-4.7 4.7-.5-2.8-1.9-4.2-4.7-4.7 2.8-.5 4.2-1.9 4.7-4.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A four-point sparkle. Color via `color` on the element (currentColor fill). */
export function Sparkle({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg className={`hb-spark ${className}`} style={style} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 0c1.1 6.6 4.4 9.9 12 11-7.6 1.1-10.9 4.4-12 12-1.1-7.6-4.4-10.9-12-12 7.6-1.1 10.9-4.4 12-11Z"
        fill="currentColor"
      />
    </svg>
  );
}
