"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetCard } from "../shared";
import { ReloadModal } from "@/features/dashboard/cards/components/ReloadModal";
import { useKycStartFlow } from "../hooks/useKycStartFlow";
import { NuroCometCtaButton } from "./NuroCometCtaButton";

const ONBOARDING_CTA_CLASS = cn(
  "relative flex w-full min-h-[40px] items-center justify-center gap-2 rounded-[var(--radius-sm)]",
  "bg-[var(--color-cta-button-bg)] px-6 py-3 text-xs font-bold text-white sm:text-sm",
  "shadow-[0_0_20px_-4px_var(--color-cta-button-glow)] transition-all hover:bg-[var(--color-cta-button-bg-hover)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-cta-button-bg)]/40",
  "disabled:cursor-not-allowed disabled:bg-[var(--color-cta-button-bg)]/35 disabled:text-white/50 disabled:shadow-none disabled:hover:bg-[var(--color-cta-button-bg)]/35",
);

function OnboardingStepCard({
  step,
  title,
  subtitle,
  ctaLabel,
  onCta,
  ctaLoading,
  ctaDisabled,
  dimmed,
  showSuccessCheck,
  cometCta,
}: {
  step: 1 | 2;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  dimmed?: boolean;
  showSuccessCheck?: boolean;
  cometCta?: boolean;
}) {
  return (
    <WidgetCard
      hideHeader
      headerDragOverlay
      fullHeight={false}
      className={cn(
        "w-full shadow-none ring-0",
        cometCta && "!overflow-visible",
        dimmed && "opacity-55",
      )}
      contentClassName="!px-4 !pt-6 !pb-4 sm:!px-5 sm:!pt-7 sm:!pb-5"
    >
      <div className="relative flex w-full flex-col items-start text-left">
        {showSuccessCheck ? (
          <CheckCircle2
            className="absolute right-0 top-0 size-5 text-emerald-400 sm:size-6"
            aria-hidden
          />
        ) : null}
        <div className="flex w-full flex-col items-start self-start">
          <span
            className="block font-semibold tabular-nums leading-none text-[var(--color-primary)]"
            style={{ fontSize: "clamp(2.75rem, 7vw, 3.25rem)" }}
          >
            {step}
          </span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            Step {step}
          </span>
        </div>
        <h1 className="mt-2.5 w-full text-left text-[16px] font-normal leading-tight text-[var(--color-text-primary)] sm:text-[18px]">
          {title}
        </h1>
        <h2 className="mt-1.5 min-h-[1.125rem] w-full whitespace-nowrap text-left text-[12px] font-normal leading-tight text-[var(--color-text-muted)] sm:min-h-[1.25rem] sm:text-[14px]">
          {subtitle}
        </h2>
        <div className={cn("mt-4 w-full", cometCta && "overflow-visible")}>
          {cometCta ? (
            <NuroCometCtaButton
              onClick={onCta}
              disabled={ctaLoading || ctaDisabled}
              fullWidth
              className="min-h-[40px] px-6 py-3 text-xs sm:text-sm"
            >
              {ctaLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {ctaLabel}
            </NuroCometCtaButton>
          ) : (
            <button
              type="button"
              onClick={onCta}
              disabled={ctaLoading || ctaDisabled}
              className={ONBOARDING_CTA_CLASS}
            >
              {ctaLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}

/** TEMP: set to false when done reviewing activated success UI */
const PREVIEW_CARD_ACTIVATED = false;

export function NewUserOnboardingSteps({ onDeposit }: { onDeposit?: () => void }) {
  const { startKyc, starting, kycUrl, cardActivated: kycCardActivated } = useKycStartFlow();
  const cardActivated = PREVIEW_CARD_ACTIVATED || kycCardActivated;
  const [reloadOpen, setReloadOpen] = useState(false);
  const openDeposit = onDeposit ?? (() => setReloadOpen(true));

  return (
    <>
      <OnboardingStepCard
        step={1}
        title={cardActivated ? "Card Activated" : "Activate your card"}
        subtitle={cardActivated ? "Continue on step 2" : "Complete identity verification (KYC)"}
        ctaLabel={cardActivated ? "Card Active" : kycUrl ? "Continue verification" : "Start Verification"}
        onCta={startKyc}
        ctaLoading={starting}
        ctaDisabled={cardActivated}
        showSuccessCheck={cardActivated}
        cometCta={!cardActivated}
      />
      <OnboardingStepCard
        step={2}
        title="Deposit stablecoins"
        subtitle="Fund your card with USDC, USDT"
        ctaLabel="Deposit now"
        onCta={openDeposit}
        ctaDisabled={!cardActivated}
        dimmed={!cardActivated}
        cometCta={cardActivated}
      />
      {!onDeposit ? <ReloadModal open={reloadOpen} onOpenChange={setReloadOpen} /> : null}
    </>
  );
}
