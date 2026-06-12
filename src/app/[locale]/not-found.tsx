import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
          The URL you followed doesn&apos;t match a route on Nuro. It may have moved, expired, or been mistyped.
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
            href="/login"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-lg text-[14px] font-medium transition-colors border"
            style={{
              borderColor: "var(--color-border-secondary, rgba(255,255,255,0.18))",
              color: "var(--color-text-primary, #f2f2f2)",
              background: "transparent",
            }}
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
