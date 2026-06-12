"use client";

import { useDashboardRefresh } from "../../../context/DashboardRefreshContext";
import { useTranslations } from "next-intl";
import { RefreshCw, Calendar as CalendarIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardInFlightBanner } from "@/layouts/Header/components/DashboardInFlightBanner";
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
} from "@/lib/walletGlassMenu";
import { usePrimaryDeckStackOptional } from "../../../context/PrimaryDeckStackContext";
import { useDemoSurfaceState } from "@/features/dashboard/overview/hooks/designSampleData";

const MORE_BUTTON_CLASSNAME =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] border-none text-white/70 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export default function QuickActions() {
  const tDash = useTranslations("Dashboard");
  const deckStack = usePrimaryDeckStackOptional();
  const { demoActive, exploring, clearDemoData } = useDemoSurfaceState();
  const { isRefreshing: refreshing, refresh: handleRefresh } = useDashboardRefresh();

  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <DashboardInFlightBanner />
      {demoActive && exploring ? (
        <button
          type="button"
          onClick={clearDemoData}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] px-4 text-[13px] font-semibold text-white/85 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {tDash("demoClearData")}
        </button>
      ) : null}
      {deckStack ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(MORE_BUTTON_CLASSNAME, "hidden min-[1280px]:inline-flex")}
              aria-label={tDash("deckStackMenuAriaLabel")}
            >
              <MoreHorizontal className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={cn(WALLET_GLASS_MENU_CONTENT, "!min-w-0 !grid !gap-1 !p-1")}
          >
            <DropdownMenuItem
              className={cn(WALLET_GLASS_MENU_ITEM_ROW_BASE, WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL)}
              onSelect={() => deckStack.openStackSettings()}
            >
              {tDash("deckStackOrderAction")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" className={MORE_BUTTON_CLASSNAME} aria-label="More actions">
          <MoreHorizontal className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
        </button>
      )}

      {/* Refresh Button */}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] border-none text-white/70 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          refreshing && "cursor-default"
        )}
        aria-label="Refresh dashboard"
      >
        <RefreshCw
          className={cn("h-4 w-4 shrink-0 opacity-90", refreshing ? "animate-spin" : "")}
          style={refreshing ? { animation: "spin 0.9s linear infinite" } : undefined}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {/* Date pill: hidden md1 (768–959); visible md2+ (960px+) */}
      <div className="hidden min-[960px]:flex items-center gap-2.5 h-10 px-4 rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] text-[var(--color-text-primary)] text-[13px] font-medium border-none opacity-90 cursor-default">
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
        <span className="tabular-nums">
          {new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}
