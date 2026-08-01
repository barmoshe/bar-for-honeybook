"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ClientflowGraphic from "./ClientflowGraphic";
import ProductPreview from "./ProductPreviews";
import { Sparkle } from "./Decor";
import BriefModal from "./BriefModal";
import HoneyBookLogo from "./HoneyBookLogo";
import { DEMO_SURFACES, PROJECTS } from "@/lib/projects";
import { PRODUCT_FEATURES, PRODUCT_SOURCES } from "@/lib/honeybookProduct";
import { whatsappHref, mailtoHref, cvHref } from "@/lib/contact";

gsap.registerPlugin(ScrollTrigger);

const HERO_TITLE = "I want to build the next thing at HoneyBook.";

function Blobs({ dim = false }: { dim?: boolean }) {
  return (
    <div className={`hb-blobs${dim ? " hb-blobs--dim" : ""}`} aria-hidden="true">
      <div className="hb-blob hb-blob--1" />
      <div className="hb-blob hb-blob--2" />
      <div className="hb-blob hb-blob--3" />
    </div>
  );
}

export default function HoneyBookApp() {
  const [modalOpen, setModalOpen] = useState(false);
  const [navShown, setNavShown] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const open = () => setModalOpen(true);

  useEffect(() => {
    const onScroll = () => setNavShown(window.scrollY > window.innerHeight * 0.7);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile carousel: keep the active dot/chip in sync with the snap scroll.
  // rAF-throttled, and setActive only fires when the index actually changes,
  // so a swipe costs a handful of renders instead of one per scroll event.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const center = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        setActive((prev) => (prev === best ? prev : best));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const goTo = (i: number) =>
    cardRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".hb-hero-title .hb-word > span", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.05,
        delay: 0.08,
      });
      gsap.utils.toArray<HTMLElement>(".hb-reveal").forEach((el) => {
        gsap.from(el, {
          y: 26,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });
      // Every card grid shares one entrance treatment. The card selectors are
      // scoped to their own grid on purpose: an unscoped ".hb-tile" matches the
      // demo tiles too, and since the trigger is the Work grid far below, they
      // would sit at opacity 0 until you scrolled past them.
      [
        [".hb-grid .hb-tile", ".hb-grid"],
        [".hb-demo-grid .hb-tile", ".hb-demo-grid"],
        [".hbai-card", ".hbai-grid"],
      ].forEach(([card, grid]) => {
        gsap.from(card, {
          y: 34,
          opacity: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          scrollTrigger: { trigger: grid, start: "top 82%" },
        });
      });
      gsap.to(".hb-flow", {
        y: -70,
        ease: "none",
        scrollTrigger: { trigger: ".hb-hero", start: "top top", end: "bottom top", scrub: true },
      });
    }, rootRef);

    let detach: (() => void) | undefined;
    if (!matchMedia("(hover: none)").matches) {
      const mags = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".hb-magnetic") ?? []);
      const onMove = (e: MouseEvent) => {
        const t = e.currentTarget as HTMLElement;
        const r = t.getBoundingClientRect();
        gsap.to(t, { x: (e.clientX - (r.left + r.width / 2)) * 0.25, y: (e.clientY - (r.top + r.height / 2)) * 0.3, duration: 0.3, ease: "power3.out" });
      };
      const onLeave = (e: MouseEvent) =>
        gsap.to(e.currentTarget as HTMLElement, { x: 0, y: 0, duration: 0.4, ease: "elastic.out(1, 0.4)" });
      mags.forEach((m) => {
        m.addEventListener("mousemove", onMove);
        m.addEventListener("mouseleave", onLeave);
      });
      detach = () => mags.forEach((m) => {
        m.removeEventListener("mousemove", onMove);
        m.removeEventListener("mouseleave", onLeave);
      });
    }
    return () => {
      ctx.revert();
      detach?.();
    };
  }, []);

  return (
    <div className="hb-root" ref={rootRef} dir="ltr" lang="en">
      <a className="hb-skip" href="#main">
        Skip to content
      </a>

      <div className={`hb-nav${navShown ? " is-shown" : ""}`} aria-hidden={!navShown}>
        <div className="hb-nav-inner">
          <span className="hb-mark">
            Bar Moshe
            <span className="hb-mark-for">
              for <HoneyBookLogo />
              <span className="hb-sr-only">HoneyBook</span>
            </span>
          </span>
          <nav className="hb-nav-links" aria-label="Sections">
            <a href="#demo">The demo</a>
            <a href="#ai">HoneyBook</a>
            <a href="#work">Work</a>
            <button className="hb-btn hb-btn--primary hb-btn--sm hb-magnetic" onClick={open} tabIndex={navShown ? 0 : -1}>
              Let&apos;s talk
            </button>
          </nav>
        </div>
      </div>

      {/* ===== Hero ===== */}
      <header className="hb-hero">
        <Sparkle className="hb-deco hb-floaty2" style={{ top: "13%", left: "48%", color: "var(--hb-ink)", width: 30, height: 30 }} />
        <span className="hb-deco hb-deco--plus" style={{ top: "11%", left: "6%", color: "oklch(0.255 0.018 230 / 0.5)" }} />
        <div className="hb-topbar">
          <span className="hb-mark">
            Bar Moshe
            <span className="hb-mark-for">
              for <HoneyBookLogo />
              <span className="hb-sr-only">HoneyBook</span>
            </span>
          </span>
        </div>
        <div className="hb-hero-grid">
          <div className="hb-hero-copy">
            <p className="hb-eyebrow hb-reveal">A builder who wants in</p>
            <h1 className="hb-hero-title">
              {/* real spaces between word spans: screen readers and copy-paste
                  must see separate words, not one glued string */}
              {HERO_TITLE.split(" ").map((w, i) => (
                <Fragment key={i}>
                  <span className="hb-word">
                    <span>{w}</span>
                  </span>{" "}
                </Fragment>
              ))}
            </h1>
            <p className="hb-hero-sub hb-reveal">
              I&apos;m Bar, an AI-native builder. I ship deployed software in hours to days,
              and I want to do it at HoneyBook. This page is me showing you, not telling you.
            </p>
            <div className="hb-hero-cta hb-reveal">
              <button className="hb-btn hb-btn--primary hb-btn--lg hb-magnetic" onClick={open}>
                Let&apos;s talk
              </button>
              <a className="hb-btn hb-btn--ghost" href={cvHref} download target="_blank" rel="noopener">
                Download CV
              </a>
              <a className="hb-btn hb-btn--ghost" href="#demo">
                See it working →
              </a>
            </div>
          </div>
          <div className="hb-hero-media">
            <ClientflowGraphic />
          </div>
        </div>
        <div className="hb-scrollcue" aria-hidden="true">
          <span />
        </div>
      </header>

      <main id="main">
        {/* ===== The working demo =====
            Sits directly after "studied up close" on purpose: the narrative is
            I read your product, then I built a working piece of it, and only
            then here is where I would plug in. */}
        <section className="hb-section hb-section--demo" id="demo">
          <span className="hb-deco hb-deco--ring hb-spin-slow" style={{ width: 54, height: 54, top: "10%", left: "5%", color: "var(--hb-slate)" }} />
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">Not a mockup</p>
            <h2 className="hb-h2 hb-reveal">So I built a working one.</h2>
            <p className="hb-demo-lede hb-reveal">
              A smart file is a block graph with gating rules: choosing services
              recomputes the invoice, the contract interpolates from both, and a
              required signature makes the invoice genuinely unreachable until
              it is signed. That last one is a real backend problem, so I built
              it rather than drew it. The rules are a Go package with no I/O and
              its own tests, the state is PostgreSQL with every query written by
              hand, and all four surfaces below run on this domain.
            </p>
            <div className="hb-demo-grid">
              {DEMO_SURFACES.map((s) => (
                <a key={s.href} className={`hb-tile hb-tile--${s.accent}`} href={s.href}>
                  <span className="hb-tile-tag">Live here</span>
                  <span className="hb-tile-name">{s.name}</span>
                  <span className="hb-tile-blurb">{s.proves}</span>
                  <span className="hb-tile-go" aria-hidden="true">
                    Open →
                  </span>
                </a>
              ))}
            </div>
            <p className="hb-demo-note hb-reveal">
              <Sparkle style={{ width: 14, height: 14, color: "var(--hb-yellow-deep)" }} />
              Fictional inventory, no card taken, nothing charged. The database
              is real Postgres compiled to WebAssembly and it resets when the
              instance recycles, which the engineering page explains rather than
              hides.
            </p>
          </div>
        </section>

        {/* ===== HoneyBook, studied up close ===== */}
        <section className="hb-section hbai-section-previews hb-inset" id="ai">
          <Sparkle
            className="hb-deco hb-floaty2"
            style={{ top: "6%", left: "4%", color: "var(--hb-yellow-deep)", width: 24, height: 24 }}
          />
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">I came prepared</p>
            <h2 className="hb-h2 hb-reveal">HoneyBook, studied up close.</h2>
            <p className="hb-lead hb-reveal">
              Before asking for a seat, I learned the product. Ten real HoneyBook features —
              clientflow, growth, and the AI toolkit — each one an original, hand-coded
              animated scene inspired by the real thing. No screenshots, no video, all in
              your brand.
            </p>
            {/* mobile-only: feature chips that drive the preview carousel */}
            <nav className="hbai-chips hb-reveal" aria-label="Jump to a preview">
              {PRODUCT_FEATURES.map((f, i) => (
                <button
                  key={f.key}
                  className={`hbai-chipbtn${active === i ? " is-active" : ""}`}
                  onClick={() => goTo(i)}
                >
                  {f.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="hb-wrap hbai-grid" ref={trackRef}>
            {PRODUCT_FEATURES.map((f, i) => (
              <article
                key={f.key}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className={`hbai-card${f.span === 2 ? " hbai-card--wide" : ""}`}
              >
                <ProductPreview feature={f.key} />
                <div className="hbai-card-body">
                  <span className="hb-tile-tag">{f.tag}</span>
                  <h3 className="hbai-card-name">{f.name}</h3>
                  <p className="hbai-card-blurb">{f.blurb}</p>
                </div>
              </article>
            ))}
          </div>
          {/* mobile-only: carousel progress */}
          <div className="hbai-dots">
            {PRODUCT_FEATURES.map((f, i) => (
              <button
                key={f.key}
                className={active === i ? "is-active" : ""}
                aria-label={`Go to ${f.name}`}
                onClick={() => goTo(i)}
              />
            ))}
            <span className="hbai-dots-count" aria-hidden="true">
              {active + 1}/{PRODUCT_FEATURES.length}
            </span>
          </div>
          <div className="hb-wrap hbai-sources hb-reveal">
            <span>Researched from:</span>
            {PRODUCT_SOURCES.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            ))}
          </div>
        </section>

        {/* ===== Work ===== */}
        <section className="hb-section hb-section--work hb-inset" id="work">
          <Sparkle className="hb-deco hb-floaty2" style={{ bottom: "8%", left: "4%", color: "var(--hb-yellow-deep)", width: 26, height: 26 }} />
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">Proof I can build</p>
            <h2 className="hb-h2 hb-reveal">Shipped, mostly solo.</h2>
          </div>
          <div className="hb-grid hb-wrap">
            {PROJECTS.map((p) => (
              <a
                key={p.name}
                className={`hb-tile hb-tile--${p.accent}${p.span === 2 ? " hb-tile--wide" : ""}`}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="hb-tile-tag">{p.tag}</span>
                <span className="hb-tile-name">{p.name}</span>
                <span className="hb-tile-blurb">{p.blurb}</span>
                <span className="hb-tile-go" aria-hidden="true">
                  View ↗
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* ===== Close ===== */}
        <section className="hb-section hb-section--close hb-inset" id="contact">
          <Blobs dim />
          <Sparkle className="hb-deco hb-floaty2" style={{ top: "18%", left: "16%", color: "var(--hb-yellow)", width: 28, height: 28 }} />
          <div className="hb-wrap hb-close-inner">
            <p className="hb-eyebrow hb-eyebrow--onink hb-reveal">The ask</p>
            <h2 className="hb-h2 hb-h2--invert hb-reveal">I&apos;d love to build here. Let&apos;s talk.</h2>
            <p className="hb-lead hb-lead--invert hb-reveal">
              This page took me an evening. Imagine what a quarter looks like.
            </p>
            <div className="hb-close-cta hb-reveal">
              <button className="hb-btn hb-btn--yellow hb-btn--lg hb-magnetic" onClick={open}>
                Let&apos;s talk
              </button>
              <a className="hb-btn hb-btn--ghost-invert" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a className="hb-btn hb-btn--ghost-invert" href={mailtoHref}>
                Email
              </a>
              <a className="hb-btn hb-btn--ghost-invert" href={cvHref} download target="_blank" rel="noopener">
                Download CV
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="hb-footer">
        <div className="hb-footer-card">
          <span className="hb-mark">
            Bar Moshe
            <span className="hb-mark-for">
              for <HoneyBookLogo />
              <span className="hb-sr-only">HoneyBook</span>
            </span>
          </span>
          <span className="hb-footer-links">
            <a href={mailtoHref}>Email</a>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <a href="https://github.com/barmoshe" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </span>
        </div>
        <div className="hb-footer-legal">
          <span>Bar Moshe · AI-native builder</span>
          <span>Made for HoneyBook</span>
        </div>
      </footer>

      {/* mobile-only: app-style bottom action bar */}
      <div className="hbai-tabbar">
        <a href="#ai" className="hbai-tab">
          Product tour
        </a>
        <a className="hbai-tab" href={whatsappHref} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        <button className="hb-btn hb-btn--primary hbai-tab-cta" onClick={open}>
          Let&apos;s talk
        </button>
      </div>

      {modalOpen && <BriefModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
