"use client";

import { useMemo } from "react";
import { CreditCard, DollarSign, TrendingUp, Shield } from "lucide-react";
import type { StatData } from "@/components";
import type { Card } from "../../../shared";

/**
 * Hook for calculating card statistics
 */
export function useCardsStats(cards: Card[], t: (key: string) => string) {
  return useMemo(() => {
    const totalBalance = cards.reduce((sum, card) => sum + card.balance, 0);
    const activeCards = cards.filter((card) => card.isActive && !card.isLocked).length;
    const lockedCards = cards.filter((card) => card.isLocked).length;
    const averageBalance = cards.length > 0 ? totalBalance / cards.length : 0;

    const stats: StatData[] = [
      {
        id: "totalBalance",
        title: t("totalBalance"),
        value: `$${totalBalance.toLocaleString()}`,
        change: 0,
        isPositive: true,
        showChange: false,
        icon: <DollarSign className="w-5 h-5" />,
      },
      {
        id: "averageBalance",
        title: t("averageBalance"),
        value: `$${averageBalance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`,
        change: 0,
        isPositive: true,
        showChange: false,
        icon: <TrendingUp className="w-5 h-5" />,
      },
      {
        id: "activeCards",
        title: t("activeCards"),
        value: `${activeCards}/${cards.length} Active`,
        change: 0,
        isPositive: true,
        icon: <CreditCard className="w-5 h-5" />,
        showChange: false,
      },
      {
        id: "securityStatus",
        title: t("securityStatus"),
        value: `${lockedCards} Frozen`,
        change: 0,
        isPositive: true,
        icon: <Shield className="w-5 h-5" />,
        showChange: false,
      },
    ];

    return stats;
  }, [cards, t]);
}
