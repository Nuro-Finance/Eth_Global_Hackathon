"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { PRIMARY_DECK_C1_FACE_SRC } from "@/features/dashboard/overview/layouts/DashboardGrid/context/PrimaryDeckStackContext";
import { useKycStartFlow } from "@/features/dashboard/overview/hooks/useKycStartFlow";

/** Same responsive footprint as `CreditCard` list view. */
const CARD_SIZE_CLASS =
  "w-[260px] h-[164px] sm:w-[300px] sm:h-[189px] md:w-[240px] md:h-[151px] lg:w-[240px] lg:h-[151px] xl:w-[280px] xl:h-[176px]";

export function CardsEmptyActivation() {
  const { kycStatus, cardActivated } = useKycStartFlow();
  const [activating, setActivating] = React.useState(false);
  const isPending = kycStatus === "pending";

  const handleActivate = () => {
    setActivating(true);
    window.dispatchEvent(new Event("nuro:verify-kyc"));
    window.setTimeout(() => setActivating(false), 1200);
  };

  const ctaLabel = cardActivated
    ? "Verified"
    : isPending
      ? "Continue Verification"
      : "Activate Your Free Card";

  return (
    <div className="flex min-h-0 w-full flex-1 items-center gap-6 lg:gap-8">
      <div
        className={`relative shrink-0 pointer-events-none ${CARD_SIZE_CLASS}`}
      >
        <img
          src={PRIMARY_DECK_C1_FACE_SRC}
          alt=""
          draggable={false}
          className="h-full w-full rounded-[20px] object-cover drop-shadow-[0_0_20px_var(--color-primary-glow)] shadow-[0_20px_35px_-10px_var(--color-card-shadow-default),0_8px_15px_-5px_var(--color-shadow-primary)]"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-4">
        <h1 className="m-0 text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
          Get Started
        </h1>
        <div className="flex w-fit max-w-full flex-col items-stretch gap-4">
          <h2 className="m-0 text-[13px] font-medium leading-snug text-[var(--color-text-muted)]">
            {isPending
              ? "Verification in progress - continue where you left off."
              : "Verify your identity to continue."}
          </h2>
          <button
            type="button"
            disabled={activating || cardActivated}
            onClick={handleActivate}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 text-[12px] font-semibold text-white hover:brightness-105 disabled:opacity-50"
          >
          {activating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Opening…
            </>
          ) : (
            ctaLabel
          )}
          </button>
        </div>
      </div>
    </div>
  );
}
