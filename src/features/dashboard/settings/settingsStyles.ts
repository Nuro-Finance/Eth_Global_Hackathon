/** Shared settings form + CTA tokens (Profile tab is source of truth). */
import { cn } from "@/lib/utils";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
} from "@/lib/walletGlassMenu";

export const SETTINGS_LABEL_CLASS =
  "mb-1.5 block text-sm text-[var(--color-text-muted)]";

export const SETTINGS_INPUT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-transparent bg-[var(--color-bg-input)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors focus:border-white/20 focus:outline-none focus:ring-0";

export const SETTINGS_INPUT_WITH_ICON_CLASS = `${SETTINGS_INPUT_CLASS} pr-10`;

export const SETTINGS_CTA_BUTTON_CLASS = "min-w-[9rem] rounded-[10px]";

export const SETTINGS_SECTION_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-[var(--color-cta-button-bg)] [&_svg]:h-5 [&_svg]:w-5";

/** Matches header icon column width (w-11) for sub-row alignment. */
export const SETTINGS_SECTION_ICON_SPACER_CLASS = "w-11 shrink-0";

/** 16px vertical gutter between setting rows/cards within a section. */
export const SETTINGS_ROW_STACK_CLASS = "flex flex-col gap-4";

export const SETTINGS_SELECT_TRIGGER_CLASS =
  "flex h-11 w-32 shrink-0 items-center justify-between rounded-[var(--radius-md)] border border-transparent !border-transparent bg-[var(--color-bg-input)] px-3 text-sm text-[var(--color-text-primary)] shadow-none outline-none transition-colors hover:bg-white/[0.05] focus:border-white/20 focus:outline-none focus:ring-0 dark:!border-transparent";

/** Glass dropdown panel - matches transactions filter / wallet sort menus. */
export const SETTINGS_GLASS_MENU_CONTENT_CLASS = cn(
  WALLET_GLASS_MENU_CONTENT,
  "!min-w-0 !grid !gap-1 !p-1"
);

const SETTINGS_GLASS_MENU_ITEM_BASE = cn(
  "!grid cursor-pointer grid-cols-[14px_auto] items-center gap-1 rounded-[var(--radius-sm)] !m-0 !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs"
);

export const SETTINGS_GLASS_MENU_ITEM_SELECTED = cn(
  SETTINGS_GLASS_MENU_ITEM_BASE,
  "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
);

export const SETTINGS_GLASS_MENU_ITEM_IDLE = cn(
  SETTINGS_GLASS_MENU_ITEM_BASE,
  "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
);

/** @deprecated Use SettingsGlassPicker + SETTINGS_GLASS_MENU_* tokens */
export const SETTINGS_SELECT_CONTENT_CLASS = SETTINGS_GLASS_MENU_CONTENT_CLASS;

/** Selected row for userNav dropdowns (language picker - icon + label, not check grid). */
export const SETTINGS_USER_NAV_ITEM_SELECTED = cn(
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  "!flex w-full min-w-0 max-w-full items-center gap-2",
  "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
);

/** @deprecated Use SETTINGS_GLASS_MENU_ITEM_IDLE */
export const SETTINGS_SELECT_ITEM_CLASS = SETTINGS_GLASS_MENU_ITEM_IDLE;

/** @deprecated Use SETTINGS_GLASS_MENU_ITEM_SELECTED or SETTINGS_USER_NAV_ITEM_SELECTED */
export const SETTINGS_SELECT_ITEM_SELECTED_CLASS = SETTINGS_GLASS_MENU_ITEM_SELECTED;
