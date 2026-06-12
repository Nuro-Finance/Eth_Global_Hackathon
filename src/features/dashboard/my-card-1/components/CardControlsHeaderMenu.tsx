"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";

const MENU_TRIGGER_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] text-white/50 transition-colors hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent data-[state=open]:bg-white/[0.03] data-[state=open]:text-white/65";

export function CardControlsHeaderMenu() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={MENU_TRIGGER_CLASS} aria-label="Card controls options">
            <MoreHorizontal className="size-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className={WALLET_GLASS_MENU_CONTENT}>
          <DropdownMenuItem
            className={cn(
              WALLET_GLASS_MENU_ITEM_ROW_BASE,
              WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
              walletGlassMenuItemRowSpacing(0, 1),
            )}
            onSelect={() => setUpgradeOpen(true)}
          >
            Advanced Controls
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}
