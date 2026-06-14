"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const RING_SIZE = 16;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type OnboardingProgressRingProps = {
  fraction: number;
  className?: string;
};

export function OnboardingProgressRing({ fraction, className }: OnboardingProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const offset = RING_CIRCUMFERENCE * (1 - clamped);

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE}
        className="text-white/20"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        className="text-[var(--color-primary)]"
      />
    </svg>
  );
}

type OnboardingSetupGuideButtonProps = {
  fraction: number;
  onClick: () => void;
  className?: string;
};

export function OnboardingSetupGuideButton({
  fraction,
  onClick,
  className,
}: OnboardingSetupGuideButtonProps) {
  const tDash = useTranslations("Dashboard");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] px-3.5 text-[13px] font-medium text-white/85 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        className,
      )}
      aria-label={tDash("setupGuideAriaLabel")}
    >
      <span>{tDash("setupGuide")}</span>
      <OnboardingProgressRing fraction={fraction} />
    </button>
  );
}
