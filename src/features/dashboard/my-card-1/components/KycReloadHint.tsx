"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { isKycVerified } from "@/lib/kyc-status";

/**
 * Inline banner shown inside the Reload modal when the user's KYC isn't
 * approved/active. Without KYC, swapped USDC lands in their wallet
 * instead of auto-crediting the card (depositRoutingActive=false on the
 * firm-quote response). Previously this state was silent until AFTER
 * the swap confirmed - too late to action.
 *
 * Fires the existing `nuro:verify-kyc` window event when the user clicks
 * "Verify identity" - KycBanner.tsx (mounted globally on the dashboard
 * shell) listens for it and opens the legal-name prompt + KYC flow.
 *
 * Self-contained: fetches its own KYC status via /api/kyc/status. Hidden
 * while loading + when KYC is approved/active. Best-effort - auth or
 * network failure renders nothing rather than a confusing error.
 */
type KycPhase = "loading" | "needs-kyc" | "ok";

export function KycReloadHint() {
  const [phase, setPhase] = useState<KycPhase>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/session");
        const s = await r.json();
        const token = s?.accessToken;
        if (!token) { if (!cancelled) setPhase("ok"); return; }  // unauth → don't render
        const sr = await fetch("/api/kyc/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sr.ok) { if (!cancelled) setPhase("ok"); return; }
        const data = await sr.json();
        const status = String(data?.status || "");
        if (cancelled) return;
 // 2026-05-25: was just `status === "approved" || status === "active"`,
 // which left out 'verified', 'kyc_complete', etc. that Issuer also uses.
 // Source of truth for verified-synonyms: src/lib/kyc-status.
        setPhase(isKycVerified(status) ? "ok" : "needs-kyc");
      } catch {
        if (!cancelled) setPhase("ok"); // fail soft
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase !== "needs-kyc") return null;

  const triggerKyc = () => {
    try {
      window.dispatchEvent(new Event("nuro:verify-kyc"));
    } catch {
 /* noop - older browsers */
    }
  };

  return (
    <div
      role="status"
      className="rounded-[var(--radius-md,10px)] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 flex items-center gap-2.5 text-[11.5px]"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[var(--color-text-primary,#fff)]">
          Reloads will land in your wallet, not your card
        </div>
        <div className="text-[10.5px] text-[var(--color-text-muted,#999)] mt-0.5">
          Complete identity verification to enable auto-credit on every reload.
        </div>
      </div>
      <button
        type="button"
        onClick={triggerKyc}
        className="shrink-0 flex items-center gap-1 rounded-[var(--radius-sm,6px)] bg-amber-500 hover:bg-amber-400 transition-colors px-2.5 py-1 text-[10.5px] font-semibold text-white"
      >
        Verify
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
