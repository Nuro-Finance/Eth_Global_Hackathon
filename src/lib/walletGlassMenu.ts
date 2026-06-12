import { cn } from "@/lib/utils";

/**
 * My-wallet / cards overflow dropdown panel — single source of truth.
 * @see ConnectedWalletDashboard sort filter menus, WalletAssetsModal, WalletRecentActivityModal.
 */
export const WALLET_GLASS_MENU_CONTENT = cn(
  "z-[200] w-max min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-white/15 py-0.5 px-1.5 text-[var(--color-text-primary)]",
  "bg-white/[0.04]",
  "supports-[backdrop-filter]:bg-white/[0.02] supports-[backdrop-filter]:backdrop-blur-[7px]",
  "glass-card-inner shadow-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
);

/** Vertical rhythm between rows inside `WALLET_GLASS_MENU_CONTENT` (matches assets sort menu). */
export function walletGlassMenuItemRowSpacing(index: number, total: number): string {
  if (total <= 1) return "my-1";
  if (index === 0) return "mt-1 mb-0.5";
  if (index === total - 1) return "mt-0.5 mb-1";
  return "my-0.5";
}

/** Default row: same padding, radius, type scale as sort overflow rows (non-selected). */
export const WALLET_GLASS_MENU_ITEM_ROW_BASE = cn(
  "cursor-pointer rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs"
);

export const WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL = cn(
  "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
);

export const WALLET_GLASS_MENU_ITEM_ROW_DANGER = cn(
  "!text-[var(--color-error)] focus:!text-[var(--color-error)]",
  "hover:!bg-[var(--color-error)]/12 hover:!text-[var(--color-error)]",
  "focus:!bg-[var(--color-error)]/15 dark:focus:!bg-[var(--color-error)]/15",
  "data-[highlighted]:!bg-[var(--color-error)]/15 data-[highlighted]:!text-[var(--color-error)]"
);
