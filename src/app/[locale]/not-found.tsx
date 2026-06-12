import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Locale-scoped 404 page. Catches /[locale]/* URLs that don't match any
 * route, layout, or rewrite — e.g. typo'd dashboard subpath, deleted
 * page, stale share-link.
 *
 * Visual treatment matches the dark theme system: dark bg,
 * brand-blue accent, Geist Sans typography, centered single-column.
 * Same token family as /skills + /agents + /dashboard so a user who
 * bounces here still feels like they're inside the Nuro product
 * surface, not on a generic Next.js error page.
 *
 * Two CTAs, no secondary noise:
 *   - "Open your dashboard" -> /dashboard (the canonical re-entry)
 *   - "See what we do" -> /skills (for unauthenticated bounce)
 *
 * No emoji, no m-dashes, no apology text. Quick orientation, fast exit.
 */
export default function NotFound() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{
        background: "var(--color-bg-primary, #111111)",
        color: "var(--color-text-primary, #f2f2f2)",
        fontFamily: "'Geist', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Soft brand-blue radial-glow underlay. Matches the atmospheric
          treatment on /skills + /agents heroes. Pointer-events disabled so
          it doesn't intercept clicks on the CTAs. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 35%, rgba(13,144,255,0.10), transparent 65%)",
          zIndex: 0,
        }}
      />

      <main className="relative z-10 text-center max-w-[520px]">
        {/* Eyebrow chip — small status pill, same pattern as /skills hero */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-medium tracking-wider uppercase mb-8"
          style={{
            background: "var(--color-brand-surface, rgba(13,144,255,0.08))",
            borderColor: "var(--color-brand-border, rgba(13,144,255,0.24))",
            color: "var(--color-primary-light, #3DA6FF)",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--color-primary, #0D90FF)" }}
          />
          404
        </div>

        <h1 className="text-[44px] sm:text-[56px] font-semibold leading-[1.05] tracking-tight mb-4">
          Page not found.
        </h1>

        <p
          className="text-[15px] sm:text-[16px] leading-relaxed mb-8 max-w-[42ch] mx-auto"
          style={{ color: "var(--color-text-secondary, #A1A1A1)" }}
        >
          The URL you followed doesn't match a route on Nuro. It may have moved, expired, or been mistyped.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-lg text-[14px] font-semibold transition-colors"
            style={{
              background: "var(--color-primary, #0D90FF)",
              color: "#001628",
            }}
          >
            Open your dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/skills"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-lg text-[14px] font-medium transition-colors border"
            style={{
              borderColor: "var(--color-border-secondary, rgba(255,255,255,0.18))",
              color: "var(--color-text-primary, #f2f2f2)",
              background: "transparent",
            }}
          >
            See what we do
          </Link>
        </div>

        {/* Tertiary nav row -- compact, Geist Mono for a developer-tools
            tone matching the rest of the marketing surface. */}
        <div
          className="mt-12 pt-6 border-t flex items-center justify-center gap-6 text-[12px] flex-wrap"
          style={{
            borderColor: "var(--color-border-primary, rgba(255,255,255,0.06))",
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            color: "var(--color-text-muted, #707070)",
          }}
        >
          <Link href="/agents" className="hover:opacity-80 transition-opacity">
            /agents
          </Link>
          <Link href="/contracts" className="hover:opacity-80 transition-opacity">
            /contracts
          </Link>
          <Link href="/dashboard/transactions" className="hover:opacity-80 transition-opacity">
            /dashboard/transactions
          </Link>
        </div>
      </main>
    </div>
  );
}
