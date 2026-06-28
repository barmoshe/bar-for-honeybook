"use client";

/**
 * The hero's animated centerpiece: HoneyBook's "clientflow" told as floating
 * product-UI cards strung along a flowing connector, with a glowing dot that
 * travels the path (inquiry -> proposal -> paid). Pure SVG + CSS, no WebGL.
 * Decorative, so aria-hidden.
 */
export default function ClientflowGraphic() {
  return (
    <div className="hb-flow" aria-hidden="true">
      <svg className="hb-flow-svg" viewBox="0 0 400 448" fill="none">
        <path
          id="hb-flowpath"
          d="M58,52 C150,96 70,180 196,212 C326,246 250,356 338,420"
          stroke="var(--hb-ink)"
          strokeOpacity="0.16"
          strokeWidth="2.5"
          strokeDasharray="3 9"
          strokeLinecap="round"
        />
        <circle r="7.5" fill="var(--hb-yellow)" stroke="var(--hb-ink)" strokeWidth="2">
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href="#hb-flowpath" />
          </animateMotion>
        </circle>
      </svg>

      {/* inquiry */}
      <div className="hb-fpill hb-fpill--inquiry hb-float" style={{ animationDelay: "0s" }}>
        <span className="hb-pulse" />
        New inquiry
      </div>

      {/* proposal card */}
      <div className="hb-fcard hb-fcard--proposal hb-float" style={{ animationDelay: "0.8s" }}>
        <div className="hb-fcard-head">
          <span className="hb-dot" />
          Proposal
        </div>
        <div className="hb-bar" />
        <div className="hb-bar hb-bar--short" />
        <span className="hb-fbtn">Accept &amp; pay</span>
      </div>

      {/* avatar */}
      <div className="hb-favatar hb-float" style={{ animationDelay: "1.4s" }} />

      {/* paid */}
      <div className="hb-fpill hb-fpill--paid hb-float" style={{ animationDelay: "0.4s" }}>
        <span className="hb-check">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        $2,400 paid
      </div>
    </div>
  );
}
