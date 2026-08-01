import "./app.css";

/**
 * Chrome for the working surfaces: /f, /studio, /console, /engineering.
 *
 * A route group rather than a path segment, so the URLs stay short and the
 * pitch page at / keeps its own stylesheet untouched. app.css is scoped under
 * .hbapp and shares the palette declared in globals.css, so these pages are the
 * same brand without inheriting the marketing page's layout rules.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
