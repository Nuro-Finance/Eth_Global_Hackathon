"use client";

import { Button } from "@/components/ui/button";
import { Wallet, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyCardFirstTimePrimaryCta } from "@/features/dashboard/my-card-1/hooks/useMyCardFirstTimePrimaryCta";
import type { CardSectionLayout } from "../../types";

interface ActionButtonsProps {
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
  cardColor?: string;
  onReloadClick?: () => void;
  onWithdrawClick?: () => void;
  layout?: CardSectionLayout;
 /** Parent supplies vertical gap (e.g. sm deck → actions at 16px) */
  noTopMargin?: boolean;
 /** sm: full-width Reload only - no Withdraw */
  reloadOnly?: boolean;
}

export function ActionButtons({
  cardColor,
  onReloadClick,
  onWithdrawClick,
  layout = "standard",
  noTopMargin = false,
  reloadOnly = false,
}: ActionButtonsProps) {
  const isSquish = layout === "squish";
  const topMarginClass = noTopMargin || isSquish ? "mt-0" : "mt-4";
  const { isFirstTimeUser, label, handleClick, disabled } =
    useMyCardFirstTimePrimaryCta(onReloadClick);
  const isOrangeTheme = cardColor?.includes("var(--color-primary)");

  const primaryCtaClass = cn(
    "h-12 px-6 text-sm font-bold rounded-[14px] transition-all duration-300 flex items-center justify-center gap-2 border-none hover:-translate-y-[2px]",
    isSquish &&
      "h-10 px-4 text-xs rounded-[12px] hover:translate-y-0",
    isOrangeTheme
      ? "bg-[var(--color-bg-qr-container)] text-[var(--color-button-text)] hover:bg-[var(--color-bg-qr-container)]/90 shadow-lg shadow-[var(--color-bg-qr-container)]/10"
      : "bg-[var(--color-primary)] text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary)]/90 shadow-lg shadow-[var(--color-primary)]/10",
  );

  if (isFirstTimeUser) {
    return (
      <div className={cn("w-full", topMarginClass)}>
        <Button
          onClick={handleClick}
          disabled={disabled}
          className={cn(primaryCtaClass, "w-full")}
        >
          <span>{label}</span>
          <ChevronRight
            className={cn(
              "w-4 h-4 shrink-0 transition-transform",
              isOrangeTheme
                ? "text-[var(--color-button-text)]"
                : "text-[var(--color-text-on-primary)]",
            )}
          />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-start gap-3",
        topMarginClass,
      )}
    >
      <Button
        onClick={onReloadClick}
        className={cn(
          primaryCtaClass,
          reloadOnly ? "w-full" : isSquish ? "min-w-0 flex-1" : "flex-[1.8]",
        )}
      >
        <span className={cn(isSquish && !reloadOnly && "truncate")}>Reload Card</span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            isOrangeTheme
              ? "text-[var(--color-button-text)]"
              : "text-[var(--color-text-on-primary)]",
          )}
        />
      </Button>

      {!reloadOnly ? (
        <button
          onClick={onWithdrawClick}
          className={cn(
            "group flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-[var(--color-text-primary)] bg-transparent text-[var(--color-text-primary)] outline-none transition-all duration-300 transform-gpu hover:-translate-y-[2px] dark:border-[var(--color-text-primary)]/60 dark:opacity-60 dark:hover:border-white dark:hover:bg-transparent dark:hover:text-white dark:hover:opacity-100 hover:bg-[var(--color-bg-input-hover)] dark:hover:bg-transparent",
            isSquish
              ? "h-10 px-4 text-xs rounded-[12px] hover:translate-y-0"
              : "h-12 gap-2 px-4 text-sm font-semibold",
          )}
        >
          <Wallet className="h-4 w-4 shrink-0 transition-none" />
          <span className={cn(isSquish && "truncate")}>Withdraw</span>
        </button>
      ) : null}
    </div>
  );
}
