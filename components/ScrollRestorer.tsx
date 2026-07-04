"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// On refresh (or back/forward), put the visitor back at the exact spot they
// left. The browser's native restore fights hydration + GSAP's transforms
// here, so we take over: track the position in sessionStorage and re-apply
// it ourselves once the page is on screen.
export default function ScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    history.scrollRestoration = "manual";

    const key = `hb-scroll:${pathname}`;

    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const [x, y] = saved.split(",").map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const restore = () =>
            window.scrollTo({ left: x, top: y, behavior: "instant" });
          // Double rAF: let hydration and first paint settle so the jump
          // lands on final layout instead of getting clobbered by it.
          requestAnimationFrame(() => requestAnimationFrame(restore));
          // Web fonts / late assets can still shift heights; re-apply once
          // everything has loaded.
          if (document.readyState !== "complete") {
            window.addEventListener("load", restore, { once: true });
          }
        }
      }
    }

    let raf = 0;
    const save = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sessionStorage.setItem(key, `${window.scrollX},${window.scrollY}`);
      });
    };
    // pagehide catches the final position even if the last scroll's rAF
    // never got to run before the refresh.
    const saveNow = () =>
      sessionStorage.setItem(key, `${window.scrollX},${window.scrollY}`);

    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", saveNow);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
}
