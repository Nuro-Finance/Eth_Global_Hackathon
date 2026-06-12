"use client";

/**
 * WelcomeBanner — first-load callout on /dashboard.
 *
 * Bridges the public marketing pages ("Open your dashboard, watch the
 * autonomous action happen") and the actual dashboard surface. Without
 * this, users land in a sea of widgets without a clear next-step. With
 * it, they get one inviting card pointing at the highest-value
 * onboarding moves — connecting their first agent and their first bank.
 *
 * Dismissed state persists in localStorage so power-users don't see it
 * after the first session. Per-tab dismissal would feel jittery.
 *
 * S35 M11 Day-3 evening: shipped as part of dashboard polish round 1
 * to close the public→auth visual gap.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, X, Bot, Landmark } from "lucide-react";

const STORAGE_KEY = "nuro:welcome-banner-dismissed-v1";

export default function WelcomeBanner() {
  const [visible, setVisible] = useState(false);

  // Read localStorage on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
  };

  if (!visible) return null;

  return (
    <div
      className="
        relative mb-6 overflow-hidden rounded-2xl
        bg-gradient-to-br from-[var(--color-brand-surface)] to-[rgba(0,192,139,0.04)]
        border border-[var(--color-brand-border)]
      "
    >
      {/* Soft radial glow for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: "-40%",
          right: "-10%",
          width: "60%",
          height: "200%",
          background:
            "radial-gradient(ellipse 50% 30% at 50% 50%, rgba(13,144,255,0.10), transparent 65%)",
        }}
      />

      <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="
              shrink-0 inline-flex w-11 h-11 rounded-xl items-center justify-center
              bg-[var(--color-brand-surface)]
              border border-[var(--color-brand-border)]
              text-[var(--color-primary)]
            "
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-primary)] mb-1.5 font-mono">
              Welcome to Nuro
            </div>
            <div className="text-[18px] md:text-[20px] font-semibold text-[var(--color-text-primary)] leading-tight tracking-tight">
              Your AI fleet is online. Watch the autonomous action happen.
            </div>
            <div className="mt-1.5 text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed max-w-[64ch]">
              Attach an external agent under our policy stack and connect a bank for fiat on/off-ramp. Then watch your fleet earn.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/dashboard/my-card-1"
            className="
              inline-flex items-center gap-1.5 h-10 px-4 rounded-lg
              text-[13px] font-medium
              bg-[var(--color-primary)] text-[#001628]
              hover:brightness-110 transition-all duration-200
            "
          >
            <Bot className="w-4 h-4" strokeWidth={1.5} />
            Activate card
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </Link>
          <Link
            href="/dashboard/my-wallet"
            className="
              inline-flex items-center gap-1.5 h-10 px-4 rounded-lg
              text-[13px] font-medium
              bg-[var(--color-bg-card)] text-[var(--color-text-primary)]
              border border-[var(--color-border-secondary)]
              hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-secondary)] transition-all duration-200
            "
          >
            <Landmark className="w-4 h-4" strokeWidth={1.5} />
            Open wallet
          </Link>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss welcome banner"
          className="
            absolute top-3 right-3 inline-flex w-7 h-7 items-center justify-center
            rounded-md
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]
            hover:bg-[var(--color-bg-hover)]
            transition-colors duration-200
          "
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
