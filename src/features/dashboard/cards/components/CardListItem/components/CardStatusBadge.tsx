"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { Card } from "../../../shared";

interface CardStatusBadgeProps {
  card: Card;
}

/**
 * CardStatusBadge - neutral pill + status dot (matches Agent Cards table + 5.4.26).
 */
export function CardStatusBadge({ card }: CardStatusBadgeProps) {
  const t = useTranslations("Cards");
  const isFrozen = card.isLocked;
  const isActive = card.isActive && !isFrozen;
  const label = isFrozen ? "Frozen" : isActive ? t("active") : t("inactive");

  return (
    <Badge
      variant="plain"
      size="sm"
      className="gap-2 text-white/70 !border-transparent !hover:border-transparent"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
    >
      {isActive && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
      )}
      {isFrozen && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-error)]" />
      )}
      {label}
    </Badge>
  );
}
