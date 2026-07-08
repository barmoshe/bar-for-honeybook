/**
 * Backs the "Claude Code. Any stack." claim above it with the actual tools:
 * MCP servers and Claude Code plugins Bar has shipped and registered, not a
 * slide. Same idea as the AI-adoption-hub catalog built for the Varonis
 * page, rebuilt here in HoneyBook's own cream/ink language instead of
 * reused wholesale.
 */

const CATALOG = [
  { name: "mdp", kind: "MCP server · Claude Code plugin", dot: "var(--hb-yellow-deep)" },
  { name: "temporal-plugin", kind: "Claude Code plugin", dot: "var(--hb-sage)" },
  { name: "entailer", kind: "MCP server · eval linter", dot: "var(--hb-teal)" },
];

export default function McpCatalog() {
  return (
    <div className="hb-catalog hb-reveal" aria-label="Registered MCP servers and Claude Code plugins">
      <div className="hb-catalog-h">What&apos;s actually registered</div>
      <ul className="hb-catalog-list">
        {CATALOG.map((c) => (
          <li key={c.name} className="hb-catalog-row">
            <span className="hb-catalog-dot" style={{ background: c.dot }} />
            <code className="hb-catalog-name">{c.name}</code>
            <span className="hb-catalog-kind">{c.kind}</span>
            <span className="hb-catalog-status">registered</span>
          </li>
        ))}
      </ul>
      <p className="hb-catalog-cap">
        Tools I&apos;ve shipped in the open, not a roadmap slide.
      </p>
    </div>
  );
}
