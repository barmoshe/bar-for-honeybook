import Link from "next/link";

/**
 * One header for every working surface.
 *
 * Each page used to carry its own, which meant they linked sideways to each
 * other and nowhere back: you could walk from the console to the studio to the
 * engineering page and never find your way to the thing that explains them, or
 * to the site the whole demo belongs to. A visitor who arrives on a shared
 * client link has no other way out.
 *
 * So the brand is a link now, always to /smart-files, and the site itself is
 * always the last item. The current surface is marked rather than omitted,
 * because a nav that hides where you are makes you count the ones that are left.
 */

const SURFACES = [
  { href: "/f", label: "The file" },
  { href: "/studio", label: "Studio" },
  { href: "/console", label: "Console" },
  { href: "/console/automations", label: "Automations" },
  { href: "/engineering", label: "Engineering" },
] as const;

export default function AppNav({
  title,
  current,
}: {
  /** What this page is, shown where the wordmark sits. */
  title: string;
  /** The href of the surface being viewed, so it can be marked. */
  current?: string;
}) {
  return (
    <header className="st-top">
      <Link href="/smart-files" className="sf-brand au-home">
        <span aria-hidden="true">&larr;</span> {title}
      </Link>
      <nav className="st-nav" aria-label="The working surfaces">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={s.href === current ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
        <Link href="/" className="au-nav-site">
          bar for HoneyBook
        </Link>
      </nav>
    </header>
  );
}
