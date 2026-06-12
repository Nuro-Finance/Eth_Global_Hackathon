"use client";

/**
 * SmoothScroll — Buttery scroll via Lenis on routes that scroll on the body.
 *
 * v15.5 (2026-05-29): route-aware. Mounted unconditionally in the root layout
 * but only INITIALIZES on routes where the body is the scroll container.
 *
 * The dashboard layout uses `<main className="fixed inset-0 overflow-y-auto">`
 * with `<body>` set to overflow-hidden — its own scroll container. If we
 * initialize Lenis at document level it intercepts all wheel events and they
 * never reach the dashboard's <main>, so dashboard scroll dies completely.
 *
 * Solution: skip Lenis on `/dashboard/*`. The dashboard already has
 * `scroll-smooth` (CSS smooth-scroll) on its main scroll container, which
 * gives a similar buttery feel via native browser smoothing. Landing, login,
 * register, and any other body-scrolling page still gets Lenis.
 *
 * Future: when we have time we can pass `wrapper: <main>` to a per-route
 * Lenis instance for the dashboard too, giving the same exponential easing
 * everywhere. For now native scroll-smooth is plenty.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

export default function SmoothScroll() {
  const pathname = usePathname();
 // Dashboard has its own scroll container (<main fixed inset-0 overflow-y-auto>).
 // Lenis at document level would intercept wheel events the dashboard needs.
  const isDashboard = pathname?.includes("/dashboard") ?? false;

  useEffect(() => {
    if (isDashboard) return;

    const lenis = new Lenis({
      duration: 1.2,
 // Exponential-out: rapid start, smooth settle. Standard premium feel curve.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
 // Leave touch alone — native iOS/Android momentum is already excellent
 // and intercepting can break pinch-zoom + pull-to-refresh.
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [isDashboard]);

  return null;
}
