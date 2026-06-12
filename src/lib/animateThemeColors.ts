import type { ThemeColors } from "@/Demo/ThemeColorSwitcher/themes";
import { prefersReducedMotion } from "@/lib/themeViewTransition";

const BRAND_COLOR_TRANSITION_MS = 520;

/** When prefers-reduced-motion, still show a brief morph (ms) */
const BRAND_COLOR_REDUCED_MS = 200;

const EASE_OUT_CUBIC = (t: number) => 1 - (1 - t) ** 3;

type Rgba = readonly [number, number, number, number];

const VAR_PAIRS: readonly (readonly [keyof ThemeColors, string])[] = [
  ["brandPrimary", "--color-primary"],
  ["brandPrimaryLight", "--color-primary-light"],
  ["brandPrimary", "--color-brand-primary"],
  ["brandPrimaryLight", "--color-brand-primary-light"],
  ["brandSurface", "--color-brand-surface"],
  ["brandBorder", "--color-brand-border"],
  ["brandGlow", "--color-brand-glow"],
  ["accent", "--color-accent"],
  ["buttonText", "--color-button-text"],
  ["cardAccent", "--color-card-accent"],
  ["cardAccentMuted", "--color-card-accent-muted"],
] as const;

const UNIQUE_VARS = [
  ...new Set(VAR_PAIRS.map(([, v]) => v)),
] as readonly string[];

function parseHexColor(s: string): Rgba | null {
  const t = s.trim();
  if (!t.startsWith("#")) return null;
  const h = t.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b, 1] as const;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b, 1] as const;
  }
  return null;
}

/** Safari / modern browsers: `color(srgb 0.2 0.5 0.9 / 0.5)` */
function parseColorSrgb(s: string): Rgba | null {
  const m = s.match(
    /color\s*\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/i
  );
  if (!m) return null;
  const r = Math.round(Number(m[1]) * 255);
  const g = Math.round(Number(m[2]) * 255);
  const b = Math.round(Number(m[3]) * 255);
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return [r, g, b, a] as const;
}

function parseRgbCss(s: string): Rgba | null {
  let m = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (m) {
    const a = m[4] !== undefined ? Number(m[4]) : 1;
    return [Number(m[1]), Number(m[2]), Number(m[3]), a] as const;
  }
  m = s.match(
    /rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/
  );
  if (m) {
    const a = m[4] !== undefined ? Number(m[4]) : 1;
    return [Number(m[1]), Number(m[2]), Number(m[3]), a] as const;
  }
  return null;
}

function parseAnyColorString(s: string): Rgba | null {
  const t = s.trim();
  if (!t) return null;
  return (
    parseHexColor(t) ??
    parseColorSrgb(t) ??
    parseRgbCss(t)
  );
}

function cssColorToRgba(value: string): Rgba {
  const direct = parseAnyColorString(value);
  if (direct) return direct;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;background-color:transparent;";
  probe.style.backgroundColor = value;
  document.documentElement.appendChild(probe);
  const bg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return parseAnyColorString(bg) ?? [0, 0, 0, 1];
}

function readVarRgba(root: HTMLElement, name: string): Rgba {
  const raw = getComputedStyle(root).getPropertyValue(name).trim();
  if (!raw) return [0, 0, 0, 1];
  return cssColorToRgba(raw);
}

function applyFilters(root: HTMLElement, theme: ThemeColors) {
  root.style.setProperty("--brand-hue-rotate", theme.brandHueRotate);
  root.style.setProperty("--brand-saturate", theme.brandSaturate);
  root.style.setProperty("--brand-brightness", theme.brandBrightness);
}

function rgbaToCss(c: Rgba): string {
  const [r, g, b, a] = c;
  if (a >= 0.999) {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * Morph brand-related CSS variables from their current computed values toward `target`.
 * Filter properties jump to the target at the start (not smoothly interpolable).
 */
export function animateBrandThemeColors(
  target: ThemeColors,
  finalize: () => void
): () => void {
  const root = document.documentElement;
  const durationMs = prefersReducedMotion()
    ? BRAND_COLOR_REDUCED_MS
    : BRAND_COLOR_TRANSITION_MS;

  let cancelled = false;
  let rafBoot0 = 0;
  let rafBoot1 = 0;
  let rafLoop = 0;

  const cancelAll = () => {
    cancelled = true;
    cancelAnimationFrame(rafBoot0);
    cancelAnimationFrame(rafBoot1);
    cancelAnimationFrame(rafLoop);
  };

  const run = () => {
    if (cancelled) return;

    const fromByVar = new Map<string, Rgba>();
    for (const v of UNIQUE_VARS) {
      fromByVar.set(v, readVarRgba(root, v));
    }

    const toByVar = new Map<string, Rgba>();
    for (const v of UNIQUE_VARS) {
      const pair = VAR_PAIRS.find(([, name]) => name === v);
      const key = pair?.[0];
      if (key) {
        toByVar.set(v, cssColorToRgba(target[key]));
      }
    }

    applyFilters(root, target);

    const start = performance.now();

    const step = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / durationMs);
      const e = EASE_OUT_CUBIC(t);

      for (const v of UNIQUE_VARS) {
        const a = fromByVar.get(v)!;
        const b = toByVar.get(v)!;
        const mix: Rgba = [
          a[0] + (b[0] - a[0]) * e,
          a[1] + (b[1] - a[1]) * e,
          a[2] + (b[2] - a[2]) * e,
          a[3] + (b[3] - a[3]) * e,
        ];
        root.style.setProperty(v, rgbaToCss(mix));
      }

      if (t < 1) {
        rafLoop = requestAnimationFrame(step);
      } else {
        finalize();
      }
    };

    rafLoop = requestAnimationFrame(step);
  };

  rafBoot0 = requestAnimationFrame(() => {
    rafBoot1 = requestAnimationFrame(run);
  });

  return cancelAll;
}
