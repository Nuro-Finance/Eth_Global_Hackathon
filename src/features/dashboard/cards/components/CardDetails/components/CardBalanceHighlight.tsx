"use client";

import { useTranslations } from "next-intl";
import type { Card } from "../../../shared";

interface CardBalanceHighlightProps {
  balance: number;
}

/**
 * CardBalanceHighlight - Displays the current balance in a highlighted box
 */
export function CardBalanceHighlight({ balance }: CardBalanceHighlightProps) {
  const t = useTranslations("Cards");

  return (
    <div className="bg-[var(--color-bg-tertiary)]/30 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[16px] p-4 mb-6 border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)]">
      <p className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px] mb-1">
        {t("currentBalance")}
      </p>
      <p className="text-[var(--color-text-primary)] text-[20px] sm:text-[24px] font-normal">
        ${balance.toLocaleString()} USD
      </p>
    </div>
  );
}
