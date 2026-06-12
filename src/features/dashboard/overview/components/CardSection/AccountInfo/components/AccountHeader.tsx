"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardSectionLayout } from "../../types";

interface AccountHeaderProps {
  onAddCard?: () => void;
  cardName?: string;
  isFrozen?: boolean;
  layout?: CardSectionLayout;
}

/**
 * Account header with title and add card button
 */
export function AccountHeader({
  onAddCard,
  cardName = "My Card",
  isFrozen = false,
  layout = "standard",
}: AccountHeaderProps) {
  const t = useTranslations();
  const isSquish = layout === "squish";

  return (
    <motion.div
      className={cn(
        "flex items-center justify-between",
        isSquish ? "mt-0 mb-4" : "mt-4 sm:mt-0 mb-3 sm:mb-4 md:mb-6",
        isFrozen && "opacity-80",
      )}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
    >
      <h3
        className={cn(
          "text-start font-bold text-[var(--color-text-primary)] truncate",
          isSquish
            ? "text-[18px] max-w-[150px] sm:max-w-[200px]"
            : "text-[18px] md:text-[18px] max-w-[150px] sm:max-w-[200px] md:max-w-[280px]",
        )}
      >
        {cardName}
      </h3>
      <div className="hidden lg:block">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddCard}
          disabled={isFrozen}
          className={cn(
            "text-[12px] font-bold rounded-[10px] px-4 h-7 h-auto py-1 flex items-center gap-2 bg-white/[0.1] hover:bg-white/[0.12] transition-all",
            isFrozen && "opacity-50 cursor-not-allowed"
          )}
        >
          <Crown className="w-3.5 h-3.5" strokeWidth={2} />
          Upgrade
        </Button>
      </div>
    </motion.div>
  );
}
