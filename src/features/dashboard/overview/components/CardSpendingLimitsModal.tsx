"use client";

import React from "react";
import { Gauge, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_MODAL_SHELL_CLASS } from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";
import { MOCK_CARDS } from "@/config/mock-data";
import { SETTINGS_SECTION_ICON_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { CardLimitEditor } from "@/features/dashboard/settings/components/AgentLimitsContent/components/CardLimitEditor";

const MODAL_INNER_CLASS =
  "relative flex w-full max-h-[min(40rem,calc(100vh-4rem))] flex-col overflow-hidden rounded-[26px] border border-white/[0.06] bg-[#1f1f1f] !backdrop-blur-none";

function formatCardSubtitle(cardId: string): string {
  const card = MOCK_CARDS.find((c) => c.id === cardId);
  if (!card) return "Configure agent spending limits for this card.";
  const last4 = card.cardNumber.replace(/\D/g, "").slice(-4);
  return `${card.cardName} •••• ${last4}`;
}

interface CardSpendingLimitsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
}

export function CardSpendingLimitsModal({
  open,
  onOpenChange,
  cardId,
}: CardSpendingLimitsModalProps) {
  const subtitle = formatCardSubtitle(cardId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        hideOverlay
        className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-[min(44rem,calc(100vw-2rem))]")}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div className={MODAL_INNER_CLASS}>
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <div className="flex shrink-0 flex-col px-6 pb-4 pt-6 sm:px-8 sm:pb-5 sm:pt-7">
            <div className="flex shrink-0 items-start gap-3 pr-8">
              <div className={SETTINGS_SECTION_ICON_CLASS}>
                <Gauge />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle asChild>
                  <h1 className="text-[18px] font-semibold leading-tight text-[var(--color-text-primary)]">
                    Spending limits
                  </h1>
                </DialogTitle>
                <DialogDescription asChild>
                  <p className="mt-1.5 text-[14px] font-medium leading-snug text-[var(--color-text-secondary)]">
                    {subtitle}
                  </p>
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 sm:px-8 sm:pb-8">
            {cardId ? <CardLimitEditor cardId={cardId} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
