"use client";

import { useEffect, useRef, useState } from "react";
import { buildWhatsAppHref, buildMailtoHref, cvHref } from "@/lib/contact";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function BriefModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");

  // Compose a prefilled message from the brief fields.
  const line = [
    name ? `Hi Bar, this is ${name}.` : "Hi Bar, I'm reaching out from HoneyBook.",
    idea ? idea : "Let's talk about what you could build with us.",
  ].join(" ");
  const wa = buildWhatsAppHref(line);
  const mail = buildMailtoHref("HoneyBook x Bar Moshe", `${line}\n\n`);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => firstFieldRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [onClose]);

  return (
    <div className="hb-modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="hb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hb-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="hb-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>

        <p className="hb-eyebrow">Let&apos;s start a conversation</p>
        <h2 id="hb-modal-title" className="hb-modal-title">
          Say hello, and I&apos;ll come running.
        </h2>
        <p className="hb-modal-sub">
          A line is enough to break the ice. It pre-fills the message so you can send it
          in one tap.
        </p>

        <label className="hb-field">
          <span>Your name</span>
          <input
            ref={firstFieldRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="off"
          />
        </label>
        <label className="hb-field">
          <span>Anything you want to ask or point me at?</span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A role, a team, a surface you'd want me to build, a prototype to settle a debate…"
            rows={3}
          />
        </label>

        <div className="hb-modal-actions">
          <a className="hb-btn hb-btn--primary" href={wa} target="_blank" rel="noopener noreferrer">
            Send on WhatsApp
          </a>
          <a className="hb-btn hb-btn--ghost" href={mail} target="_blank" rel="noopener noreferrer">
            Send as email
          </a>
          <a className="hb-btn hb-btn--ghost" href={cvHref} download>
            Download CV
          </a>
        </div>
      </div>
    </div>
  );
}
