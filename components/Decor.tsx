import type { CSSProperties } from "react";

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
