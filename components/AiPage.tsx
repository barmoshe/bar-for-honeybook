"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AiPreview from "./AiPreviews";
import BriefModal from "./BriefModal";
import { Sparkle } from "./Decor";
import { AI_FEATURES, AI_FACTS, AI_IDEAS, AI_SOURCES } from "@/lib/honeybookAi";
import { whatsappHref, mailtoHref } from "@/lib/contact";

gsap.registerPlugin(ScrollTrigger);

/**
 * /ai — "I did the homework": HoneyBook's real AI surface, researched and
 * rebuilt as live animated previews, then the three things I'd build on it.
 */
export default function AiPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const open = () => setModalOpen(true);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".hbai-hero .hb-reveal", {
        y: 26,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.09,
        delay: 0.05,
      });
      gsap.utils.toArray<HTMLElement>(".hbai-below .hb-reveal").forEach((el) => {
        gsap.from(el, {
          y: 26,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });
      gsap.from(".hbai-card", {
        y: 34,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: ".hbai-grid", start: "top 82%" },
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div className="hb-root" ref={rootRef} dir="ltr" lang="en">
      <a className="hb-skip" href="#main">
        Skip to content
      </a>

      {/* ===== Header ===== */}
      <header className="hbai-hero">
        <Sparkle
          className="hb-deco hb-floaty2"
          style={{ top: "16%", right: "10%", color: "var(--hb-yellow-deep)", width: 28, height: 28 }}
        />
        <span
          className="hb-deco hb-deco--ring hb-spin-slow"
          style={{ width: 54, height: 54, bottom: "14%", left: "5%", color: "var(--hb-slate)" }}
        />
        <div className="hb-topbar">
          <span className="hb-mark">Bar Moshe</span>
          <nav className="hbai-topnav" aria-label="Page">
            <Link href="/">← Back to the pitch</Link>
            <button className="hb-btn hb-btn--primary hb-btn--sm" onClick={open}>
              Let&apos;s talk
            </button>
          </nav>
        </div>
        <div className="hb-wrap hbai-hero-inner">
          <p className="hb-eyebrow hb-reveal">I did the homework</p>
          <h1 className="hbai-title hb-reveal">
            HoneyBook&nbsp;×&nbsp;AI, <span className="hbai-title-mark">previewed live.</span>
          </h1>
          <p className="hb-lead hb-reveal">
            I researched what HoneyBook is actually shipping — priority leads, the AI Notetaker,
            the plain-language automations builder — and rebuilt each one by hand as a living,
            animated preview. Nothing below is a screenshot or a video. It&apos;s all code,
            moving right now, in your brand.
          </p>
        </div>
      </header>

      <main id="main" className="hbai-below">
        {/* ===== Researched facts ===== */}
        <section className="hb-section hb-section--stats" aria-label="HoneyBook facts">
          <div className="hb-wrap">
            <div className="hb-stats">
              {AI_FACTS.map((f) => (
                <div className="hb-stat hb-reveal" key={f.num}>
                  <div className="hb-stat-num">{f.num}</div>
                  <div className="hb-stat-label">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Live animated previews ===== */}
        <section className="hb-section hbai-section-previews" id="previews">
          <Sparkle
            className="hb-deco hb-floaty2"
            style={{ top: "6%", left: "4%", color: "var(--hb-yellow-deep)", width: 24, height: 24 }}
          />
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">Your AI surface, rebuilt by hand</p>
            <h2 className="hb-h2 hb-reveal">Five features. Five live previews.</h2>
            <p className="hb-lead hb-reveal">
              Each card is a real HoneyBook AI feature, re-imagined as an animated product scene.
              This is how I work: read the docs, understand the product, then show it running.
            </p>
          </div>
          <div className="hb-wrap hbai-grid">
            {AI_FEATURES.map((f) => (
              <article
                key={f.key}
                className={`hbai-card${f.span === 2 ? " hbai-card--wide" : ""}`}
              >
                <AiPreview feature={f.key} />
                <div className="hbai-card-body">
                  <span className="hb-tile-tag">{f.tag}</span>
                  <h3 className="hbai-card-name">{f.name}</h3>
                  <p className="hbai-card-blurb">{f.blurb}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="hb-wrap hbai-sources hb-reveal">
            <span>Researched from:</span>
            {AI_SOURCES.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            ))}
          </div>
        </section>

        {/* ===== What I'd build next ===== */}
        <section className="hb-section hb-section--fit" id="next">
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">Where I&apos;d plug in</p>
            <h2 className="hb-h2 hb-reveal">What I&apos;d build on top of it.</h2>
            <div className="hb-fit-grid">
              {AI_IDEAS.map((idea, i) => (
                <div className="hb-fit-card hb-reveal" key={idea.t}>
                  <span className="hb-fit-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{idea.t}</h3>
                  <p>{idea.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Close ===== */}
        <section className="hb-section hb-section--close" id="contact">
          <Sparkle
            className="hb-deco hb-floaty2"
            style={{ top: "18%", left: "16%", color: "var(--hb-yellow)", width: 28, height: 28 }}
          />
          <div className="hb-wrap hb-close-inner">
            <p className="hb-eyebrow hb-eyebrow--onink hb-reveal">The ask, again</p>
            <h2 className="hb-h2 hb-h2--invert hb-reveal">
              You&apos;re building AI for the independents. So am I.
            </h2>
            <p className="hb-lead hb-lead--invert hb-reveal">
              This page took me an evening. Imagine what a quarter looks like.
            </p>
            <div className="hb-close-cta hb-reveal">
              <button className="hb-btn hb-btn--primary hb-btn--lg" onClick={open}>
                Let&apos;s talk
              </button>
              <a className="hb-btn hb-btn--ghost-invert" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <Link className="hb-btn hb-btn--ghost-invert" href="/">
                Back to the pitch
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="hb-footer">
        <span>Bar Moshe · AI-native builder</span>
        <span className="hb-footer-links">
          <a href={mailtoHref}>Email</a>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a href="https://github.com/barmoshe" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </span>
        <span>Made for HoneyBook</span>
      </footer>

      {modalOpen && <BriefModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
