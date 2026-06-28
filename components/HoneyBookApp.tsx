"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ClientflowGraphic from "./ClientflowGraphic";
import { Sparkle } from "./Decor";
import Stats from "./Stats";
import BriefModal from "./BriefModal";
import { PROJECTS } from "@/lib/projects";
import { whatsappHref, mailtoHref, cvHref } from "@/lib/contact";

gsap.registerPlugin(ScrollTrigger);

const HERO_TITLE = "I want to build the next thing at HoneyBook.";
const SKILLS = [
  "Claude Code",
  "AI agent workflows",
  "Any stack, fit to the job",
  "Idea → production",
];
const FITS = [
  { n: "01", t: "Faster decisions", d: "Ideas reach a clickable, deployed surface the same day. You decide on a running thing, not a doc." },
  { n: "02", t: "AI on the weight, judgment human", d: "Agents carry the repetitive load. I own the architecture, the taste, and the last 10%." },
  { n: "03", t: "Fluent in clientflow", d: "Async, identity, proposal to payment. I'm comfortable in the systems you run on and learn a codebase fast." },
];

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const open = () => setModalOpen(true);

  useEffect(() => {
    const onScroll = () => setNavShown(window.scrollY > window.innerHeight * 0.7);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      gsap.from(".hb-tile", {
        y: 34,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.07,
        scrollTrigger: { trigger: ".hb-grid", start: "top 82%" },
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
          <span className="hb-mark">Bar Moshe</span>
          <nav className="hb-nav-links" aria-label="Sections">
            <a href="#about">About</a>
            <a href="#work">Work</a>
            <button className="hb-btn hb-btn--primary hb-btn--sm hb-magnetic" onClick={open} tabIndex={navShown ? 0 : -1}>
              Let&apos;s talk
            </button>
          </nav>
        </div>
      </div>

      {/* ===== Hero ===== */}
      <header className="hb-hero">
        <Blobs />
        <Sparkle className="hb-deco hb-floaty2" style={{ top: "13%", left: "48%", color: "var(--hb-yellow-deep)", width: 30, height: 30 }} />
        <span className="hb-deco hb-deco--plus" style={{ top: "11%", left: "6%", color: "oklch(0.255 0.018 230 / 0.5)" }} />
        <div className="hb-topbar">
          <span className="hb-mark">Bar Moshe</span>
          <span className="hb-topbar-for">For the HoneyBook team</span>
        </div>
        <div className="hb-hero-grid">
          <div className="hb-hero-copy">
            <p className="hb-eyebrow hb-reveal">A builder who wants in</p>
            <h1 className="hb-hero-title">
              {HERO_TITLE.split(" ").map((w, i) => (
                <span className="hb-word" key={i}>
                  <span>{w}</span>
                </span>
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
              <a className="hb-btn hb-btn--ghost" href={cvHref} download>
                Download CV
              </a>
            </div>
          </div>
          <ClientflowGraphic />
        </div>
        <div className="hb-scrollcue" aria-hidden="true">
          <span />
        </div>
      </header>

      <main id="main">
        {/* ===== Stats (the one bold yellow beat) ===== */}
        <section className="hb-section hb-section--stats">
          <div className="hb-wrap">
            <Stats />
          </div>
        </section>

        {/* ===== About / How I build (consolidated) ===== */}
        <section className="hb-section hb-section--about" id="about">
          <Sparkle className="hb-deco hb-floaty2" style={{ top: "12%", right: "9%", color: "var(--hb-yellow-deep)", width: 26, height: 26 }} />
          <div className="hb-wrap hb-about">
            <div className="hb-about-copy">
              <p className="hb-eyebrow hb-reveal">About</p>
              <h2 className="hb-h2 hb-reveal">Claude Code. Any stack. Always current.</h2>
              <p className="hb-lead hb-reveal">
                I run my own agent-operated workshop on Claude Code, which gives one builder
                the throughput of a small team. I track the frontier and verify against live
                docs, not stale memory. The stack is whatever fits; the judgment, taste, and
                last 10% are the constant. I would rather hand you a running thing than a deck.
              </p>
              <ul className="hb-skills hb-reveal" aria-label="What I bring">
                {SKILLS.map((s) => (
                  <li key={s} className="hb-skill">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hb-about-card hb-reveal">
              <div
                className="hb-about-photo"
                role="img"
                aria-label="Portrait of Bar Moshe"
                style={{ backgroundImage: "url(/bar.png)" }}
              />
              <div className="hb-about-name">Bar Moshe</div>
              <div className="hb-about-role">AI-native builder</div>
              <div className="hb-about-meta" aria-hidden="true">
                <span>Idea → deployed</span>
                <span>Ships solo, fast</span>
                <span>Current by default</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Why I'd fit ===== */}
        <section className="hb-section hb-section--fit">
          <span className="hb-deco hb-deco--ring hb-spin-slow" style={{ width: 60, height: 60, top: "9%", right: "6%", color: "var(--hb-slate)" }} />
          <div className="hb-wrap">
            <p className="hb-eyebrow hb-reveal">Why I&apos;d fit at HoneyBook</p>
            <h2 className="hb-h2 hb-reveal">The way you build is how I already work.</h2>
            <div className="hb-fit-grid">
              {FITS.map((f) => (
                <div className="hb-fit-card hb-reveal" key={f.n}>
                  <span className="hb-fit-num">{f.n}</span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Work ===== */}
        <section className="hb-section hb-section--work" id="work">
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
        <section className="hb-section hb-section--close" id="contact">
          <Blobs dim />
          <Sparkle className="hb-deco hb-floaty2" style={{ top: "18%", left: "16%", color: "var(--hb-yellow)", width: 28, height: 28 }} />
          <div className="hb-wrap hb-close-inner">
            <p className="hb-eyebrow hb-eyebrow--onink hb-reveal">The ask</p>
            <h2 className="hb-h2 hb-h2--invert hb-reveal">I&apos;d love to build here. Let&apos;s talk.</h2>
            <p className="hb-lead hb-lead--invert hb-reveal">
              If there is a place for a builder who ships this fast, I want to be in the room.
            </p>
            <div className="hb-close-cta hb-reveal">
              <button className="hb-btn hb-btn--primary hb-btn--lg hb-magnetic" onClick={open}>
                Let&apos;s talk
              </button>
              <a className="hb-btn hb-btn--ghost-invert" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a className="hb-btn hb-btn--ghost-invert" href={mailtoHref}>
                Email
              </a>
              <a className="hb-btn hb-btn--ghost-invert" href={cvHref} download>
                Download CV
              </a>
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
