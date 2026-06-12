"use client";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Card } from "../../shared";
import {
  CardBalanceHighlight,
  CardDetailsList,
  CardQuickActions,
} from "./components";

interface CardDetailsProps {
  card: Card;
}

/**
 * CardDetails - Displays full card details with actions
 */
export default function CardDetails({ card }: CardDetailsProps) {
  const t = useTranslations("Cards");

  return (
    <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[var(--color-text-secondary)] text-[16px] sm:text-[18px] font-normal">
          {t("cardDetails")}
        </h3>
        <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--color-text-muted)]" />
      </div>

      <CardBalanceHighlight balance={card.balance} />
      <CardDetailsList card={card} />
      <CardQuickActions card={card} />
    </div>
  );
}

export { CardDetails };
