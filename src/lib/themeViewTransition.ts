/** Full-screen veil for light/dark toggle (ThemeContext). */

const FADE_IN_MS = 340;
const FADE_OUT_MS = 420;
const FADE_IN_REDUCED_MS = 140;
const FADE_OUT_REDUCED_MS = 160;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const OVERLAY_ID = "nuro-theme-crossfade-overlay";

/** Fade veil in → applyDom() → fade out. */
export function runThemeCrossfade(applyDom: () => void): void {
  if (typeof document === "undefined") return;

  const reduced = prefersReducedMotion();
  const fadeIn = reduced ? FADE_IN_REDUCED_MS : FADE_IN_MS;
  const fadeOut = reduced ? FADE_OUT_REDUCED_MS : FADE_OUT_MS;

  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    pointerEvents: "none",
 /* Neutral curtain - readable in light and dark before/after swap */
    background: "rgba(0, 0, 0, 0.55)",
    opacity: "0",
    transition: `opacity ${fadeIn}ms ${EASING}`,
  });

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });
  });

  window.setTimeout(() => {
    applyDom();
    overlay.style.transition = `opacity ${fadeOut}ms ${EASING}`;
    overlay.style.opacity = "0";
    window.setTimeout(() => {
      overlay.remove();
    }, fadeOut + 50);
  }, fadeIn);
}
