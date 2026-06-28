"use client";

import { useEffect, useRef, useState } from "react";

type Stat = { to?: number; suffix?: string; text?: string; label: string };

const STATS: Stat[] = [
  { to: 9, suffix: "+", label: "products shipped" },
  { text: "hrs–days", label: "idea to deployed" },
  { to: 1, label: "builder, full-stack + AI" },
  { to: 100, suffix: "%", label: "shipped solo" },
];

export default function Stats() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vals, setVals] = useState<(number | null)[]>(
    STATS.map((s) => (s.to != null ? 0 : null)),
  );

  useEffect(() => {
    const finalize = () => setVals(STATS.map((s) => s.to ?? null));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finalize();
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1100;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          const e = 1 - Math.pow(1 - p, 3);
          setVals(STATS.map((s) => (s.to != null ? Math.round(s.to * e) : null)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="hb-stats" ref={ref}>
      {STATS.map((s, i) => (
        <div className="hb-stat" key={i}>
          <div className="hb-stat-num">
            {s.to != null ? `${vals[i] ?? 0}${s.suffix ?? ""}` : s.text}
          </div>
          <div className="hb-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
