"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Globe, Loader2, Lock, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import type { EnsClaimResult, EnsIdentity, EnsVisibility } from "@/lib/ens/types";
import { normalizeEnsSlug } from "@/lib/ens/slug";
import { useDebounce } from "@/features/ens/hooks/useDebounce";

type WizardStep = "business" | "agent" | "success";

export interface EnsIdentityWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (result: EnsClaimResult) => void;
}

export function EnsIdentityWizard({ open, onOpenChange, onComplete }: EnsIdentityWizardProps) {
  const [step, setStep] = useState<WizardStep>("business");
  const [identity, setIdentity] = useState<EnsIdentity | null>(null);
  const [businessSlug, setBusinessSlug] = useState("");
  const [agentSlug, setAgentSlug] = useState("");
  const [visibility, setVisibility] = useState<EnsVisibility>("private");
  const [previewFullName, setPreviewFullName] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<EnsClaimResult | null>(null);
  const [copied, setCopied] = useState(false);

  const debouncedBusiness = useDebounce(businessSlug, 350);
  const debouncedAgent = useDebounce(agentSlug, 350);

  const activeKind = step === "business" ? "business" : "agent";
  const debouncedSlug = step === "business" ? debouncedBusiness : debouncedAgent;

  const loadIdentity = useCallback(async () => {
    try {
      const r = await fetch("/api/ens/identity");
      if (!r.ok) return;
      const data = (await r.json()) as EnsIdentity;
      setIdentity(data);
      if (data.businessSlug) {
        setBusinessSlug(data.businessSlug);
        setStep("agent");
      }
    } catch {
      /* design mock */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setClaimError(null);
    setSuccessResult(null);
    setCopied(false);
    void loadIdentity();
  }, [open, loadIdentity]);

  useEffect(() => {
    if (!open || step === "success") return;
    const slug = normalizeEnsSlug(debouncedSlug);
    if (slug.length < 3) {
      setPreviewFullName("");
      setAvailability("idle");
      setAvailabilityError(null);
      return;
    }

    let cancelled = false;
    setAvailability("checking");
    const params = new URLSearchParams({
      kind: activeKind,
      slug,
    });
    if (activeKind === "agent" && identity?.businessSlug) {
      params.set("businessSlug", identity.businessSlug);
    }

    fetch(`/api/ens/check?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPreviewFullName(data.fullName ?? "");
        if (data.error) {
          setAvailability("taken");
          setAvailabilityError(data.error);
          return;
        }
        setAvailabilityError(null);
        setAvailability(data.available ? "available" : "taken");
      })
      .catch(() => {
        if (!cancelled) setAvailability("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [open, step, debouncedSlug, activeKind, identity?.businessSlug]);

  const canSubmit = useMemo(() => {
    if (availability !== "available") return false;
    const slug = normalizeEnsSlug(step === "business" ? businessSlug : agentSlug);
    return slug.length >= 3;
  }, [availability, step, businessSlug, agentSlug]);

  const handleClaim = async () => {
    setSubmitting(true);
    setClaimError(null);
    try {
      const kind = step === "business" ? "business" : "agent";
      const slug = normalizeEnsSlug(kind === "business" ? businessSlug : agentSlug);
      const r = await fetch("/api/ens/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          slug,
          visibility: kind === "business" ? "public" : visibility,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setClaimError(data.error ?? "Could not claim name");
        return;
      }
      const result = data as EnsClaimResult;
      if (kind === "business") {
        await loadIdentity();
        setStep("agent");
        setAgentSlug("");
        setAvailability("idle");
        return;
      }
      setSuccessResult(result);
      setStep("success");
      onComplete?.(result);
    } catch {
      setClaimError("Could not claim name");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!successResult?.fullName) return;
    copyToClipboard(successResult.fullName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parent = identity?.parent ?? "nurofi.eth";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className="z-[110] flex max-h-[min(85vh,36rem)] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 overflow-hidden !rounded-[32px] border border-white/[0.06] bg-white/[0.03] p-0 backdrop-blur-md"
      >
        <div className="border-b border-white/[0.06] px-6 py-5">
          <DialogTitle className="text-lg font-semibold text-[var(--color-text-primary)]">
            {step === "success" ? "Agent identity ready" : "Name your agent"}
          </DialogTitle>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {step === "business"
              ? "Choose your business name on the Nuro registry."
              : step === "agent"
                ? "Add an agent identity - fund by name, not hex."
                : "Share this name to fund your agent."}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {step === "business" ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Business name
                </label>
                <Input
                  variant="glass"
                  placeholder="bobsburgers"
                  value={businessSlug}
                  onChange={(e) => setBusinessSlug(e.target.value)}
                  autoFocus
                />
              </div>
              <PreviewCard
                label="Your business identity"
                fullName={previewFullName || (businessSlug ? `${normalizeEnsSlug(businessSlug) || "…"}.${parent}` : `your-business.${parent}`)}
                availability={availability}
                availabilityError={availabilityError}
              />
            </>
          ) : null}

          {step === "agent" ? (
            <>
              {identity?.businessFullName ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  Business:{" "}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {identity.businessFullName}
                  </span>
                </div>
              ) : null}
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Agent name
                </label>
                <Input
                  variant="glass"
                  placeholder="amazon"
                  value={agentSlug}
                  onChange={(e) => setAgentSlug(e.target.value)}
                  autoFocus
                />
              </div>
              <PreviewCard
                label="Agent deposit identity"
                fullName={
                  previewFullName ||
                  (agentSlug && identity?.businessSlug
                    ? `${normalizeEnsSlug(agentSlug) || "…"}-${identity.businessSlug}.${parent}`
                    : `agent-${identity?.businessSlug ?? "business"}.${parent}`)
                }
                availability={availability}
                availabilityError={availabilityError}
              />
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  {visibility === "private" ? (
                    <Lock className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />
                  ) : (
                    <Globe className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {visibility === "private" ? "Private (unlisted)" : "Public (listed)"}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {visibility === "private"
                        ? "Not shown in fleet browse - share the name directly."
                        : "Visible in your agent fleet."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={visibility === "public"}
                  onCheckedChange={(on) => setVisibility(on ? "public" : "private")}
                />
              </div>
            </>
          ) : null}

          {step === "success" && successResult ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15">
                <Sparkles className="size-7 text-[var(--color-primary)]" />
              </div>
              <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {successResult.fullName}
              </p>
              <p className="mt-2 max-w-sm text-sm text-[var(--color-text-muted)]">
                {successResult.visibility === "private"
                  ? "Unlisted agent identity - copy and share with funders."
                  : "Public agent identity - resolves in any CCIP-capable wallet."}
              </p>
              <p className="mt-3 font-mono text-xs text-[var(--color-text-muted)]">
                {successResult.address.slice(0, 10)}…{successResult.address.slice(-8)}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 gap-2 border-white/10 bg-white/[0.03]"
                onClick={handleCopy}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy ENS name"}
              </Button>
            </div>
          ) : null}

          {claimError ? (
            <p className="text-sm text-[var(--color-error)]">{claimError}</p>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] px-6 py-4">
          {step !== "success" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[var(--color-primary)] text-white"
                disabled={!canSubmit || submitting}
                onClick={() => void handleClaim()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Claiming…
                  </>
                ) : step === "business" ? (
                  "Claim business name"
                ) : (
                  "Claim agent name"
                )}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="w-full bg-[var(--color-primary)] text-white"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCard({
  label,
  fullName,
  availability,
  availabilityError,
}: {
  label: string;
  fullName: string;
  availability: "idle" | "checking" | "available" | "taken";
  availabilityError: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 break-all text-base font-semibold text-[var(--color-text-primary)]">
        {fullName}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {availability === "checking" ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-[var(--color-text-muted)]" />
            <span className="text-[var(--color-text-muted)]">Checking availability…</span>
          </>
        ) : null}
        {availability === "available" ? (
          <>
            <Check className="size-3.5 text-emerald-400" />
            <span className="text-emerald-400">Available</span>
          </>
        ) : null}
        {availability === "taken" || availabilityError ? (
          <span className={cn("text-amber-400")}>{availabilityError ?? "Not available"}</span>
        ) : null}
      </div>
    </div>
  );
}
