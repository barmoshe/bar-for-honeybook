"use client";

import type { ProductFeature } from "@/lib/honeybookProduct";

/**
 * Original hand-coded animated scenes inspired by HoneyBook's real AI features,
 * built as looping product-UI vignettes (pure CSS/SVG keyframes, no video, no WebGL).
 * Each scene sits in a shared browser-chrome frame. Decorative: aria-hidden,
 * and every loop dies under prefers-reduced-motion via the global kill rule.
 */

function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hbai-frame" aria-hidden="true">
      <div className="hbai-chrome">
        <span className="hbai-chrome-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="hbai-chrome-title">{title}</span>
      </div>
      <div className="hbai-scene">{children}</div>
    </div>
  );
}

/* Priority leads: inbox rows, AI badges pulse onto the hot ones. */
const LEAD_ROWS = [
  { d: "0s", avatar: "a", lines: [72, 46], badge: "hot" as const },
  { d: "0.5s", avatar: "b", lines: [60, 38], badge: "budget" as const },
  { d: "1s", avatar: "c", lines: [52, 30], dim: true },
];

function LeadsScene() {
  return (
    <Frame title="honeybook.com · leads">
      {LEAD_ROWS.map((row) => (
        <div
          key={row.avatar}
          className={`hbai-lead${row.dim ? " hbai-lead--dim" : ""}`}
          style={{ "--d": row.d } as React.CSSProperties}
        >
          <span className={`hbai-avatar hbai-avatar--${row.avatar}`} />
          <span className="hbai-lead-lines">
            {row.lines.map((w) => (
              <i key={w} style={{ width: `${w}%` }} />
            ))}
          </span>
          {row.badge === "hot" && (
            <span className="hbai-badge hbai-badge--hot">
              <span className="hbai-badge-pulse" />
              Likely to book
            </span>
          )}
          {row.badge === "budget" && (
            <span className="hbai-badge hbai-badge--budget">High budget</span>
          )}
        </div>
      ))}
    </Frame>
  );
}

/* AI Notetaker: live mic + equalizer, notes typing themselves in. */
function NotetakerScene() {
  return (
    <Frame title="honeybook.com · meeting">
      <div className="hbai-rec">
        <span className="hbai-rec-dot" />
        Recording
        <span className="hbai-eq">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ "--d": `${i * 0.14}s` } as React.CSSProperties} />
          ))}
        </span>
      </div>
      <div className="hbai-notes">
        {[88, 72, 58].map((w, i) => (
          <div
            key={w}
            className="hbai-note"
            style={{ "--d": `${i * 1.1}s`, "--w": `${w}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <span className="hbai-chip">✓ Next steps captured</span>
    </Frame>
  );
}

/* Automations builder: a typed prompt becomes a glowing workflow. */
function BuilderScene() {
  return (
    <Frame title="honeybook.com · automations">
      <div className="hbai-prompt">
        <span className="hbai-prompt-text">When a lead books, send the contract…</span>
        <span className="hbai-caret" />
      </div>
      <div className="hbai-flowrow">
        <svg className="hbai-wire" viewBox="0 0 300 10" preserveAspectRatio="none">
          <path d="M0,5 L300,5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 7" strokeLinecap="round" />
        </svg>
        <div className="hbai-node" style={{ "--d": "0s" } as React.CSSProperties}>
          Lead books
        </div>
        <div className="hbai-node" style={{ "--d": "1.5s" } as React.CSSProperties}>
          Contract
        </div>
        <div className="hbai-node" style={{ "--d": "3s" } as React.CSSProperties}>
          Invoice
        </div>
      </div>
      <span className="hbai-chip hbai-chip--yellow">Workflow ready — activate</span>
    </Frame>
  );
}

/* Drafts & follow-ups: an email writing itself, send button warming up. */
function EmailScene() {
  return (
    <Frame title="honeybook.com · compose">
      <div className="hbai-mailhead">
        <span className="hbai-mail-to">To: Dana · Wedding, Oct 12</span>
        <span className="hbai-spark">✦ AI draft</span>
      </div>
      <div className="hbai-notes hbai-notes--mail">
        {[92, 80, 64, 40].map((w, i) => (
          <div
            key={w}
            className="hbai-note"
            style={{ "--d": `${i * 0.9}s`, "--w": `${w}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <span className="hbai-send">Send follow-up</span>
    </Frame>
  );
}

/* Trends: a chart that keeps drawing itself, ticker climbing. */
function TrendsScene() {
  return (
    <Frame title="honeybook.com · insights">
      <div className="hbai-ticker">
        Bookings <strong>▲ 23%</strong>
      </div>
      <svg className="hbai-chart" viewBox="0 0 300 120" preserveAspectRatio="none">
        <path
          className="hbai-chart-grid"
          d="M0,30 H300 M0,60 H300 M0,90 H300"
          stroke="currentColor"
          strokeWidth="1"
        />
        {/* the dot rides the drawn line via mpath — one path, one source of truth */}
        <path
          id="hbai-chart-path"
          className="hbai-chart-line"
          d="M8,100 C50,92 70,64 105,70 C140,76 160,40 200,44 C240,48 262,24 292,16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle className="hbai-chart-dot" r="6">
          <animateMotion
            dur="5s"
            repeatCount="indefinite"
            keyPoints="0;1;1"
            keyTimes="0;0.7;1"
            calcMode="linear"
          >
            <mpath href="#hbai-chart-path" />
          </animateMotion>
        </circle>
      </svg>
      <span className="hbai-chip">Today: follow up with 3 warm leads</span>
    </Frame>
  );
}

/* Referral engine: a booked client's trackable link travels across and
   becomes a brand-new lead. */
function ReferralScene() {
  return (
    <Frame title="honeybook.com · referrals">
      <div className="hbai-ref-row">
        <div className="hbai-lead hbai-ref-card">
          <span className="hbai-avatar hbai-avatar--a" />
          <span className="hbai-ref-name">
            Dana
            <em>Booked · loved it</em>
          </span>
        </div>
        <div className="hbai-ref-path">
          <svg viewBox="0 0 220 40" preserveAspectRatio="none">
            <path
              id="hbai-ref-curve"
              d="M4,20 C60,4 160,36 216,20"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="3 8"
              strokeLinecap="round"
              fill="none"
            />
            <circle className="hbai-ref-dot" r="6">
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                keyPoints="0;1;1"
                keyTimes="0;0.55;1"
                calcMode="linear"
              >
                <mpath href="#hbai-ref-curve" />
              </animateMotion>
            </circle>
          </svg>
        </div>
        <div className="hbai-lead hbai-ref-card hbai-ref-card--new">
          <span className="hbai-avatar hbai-avatar--b" />
          <span className="hbai-ref-name">
            New lead
            <em>via Dana&apos;s link</em>
          </span>
        </div>
      </div>
      <div className="hbai-ref-link">
        <span className="hbai-ref-link-icon">⚭</span>
        honeybook.com/r/dana — tracked
      </div>
      <span className="hbai-chip hbai-chip--yellow">Referred → booked</span>
    </Frame>
  );
}

const SCENES: Record<ProductFeature["key"], () => React.ReactElement> = {
  leads: LeadsScene,
  notetaker: NotetakerScene,
  builder: BuilderScene,
  email: EmailScene,
  trends: TrendsScene,
  referral: ReferralScene,
};

export default function ProductPreview({ feature }: { feature: ProductFeature["key"] }) {
  const Scene = SCENES[feature];
  return <Scene />;
}
