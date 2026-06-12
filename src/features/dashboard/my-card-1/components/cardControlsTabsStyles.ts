/** Shared Card Controls segmented tabs (My Card + Agent Cards). */
export const CARD_CONTROLS_TABS_LIST_CLASS =
  "grid w-full grid-cols-3 bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-input)] border-none p-1 h-12 rounded-[14px] shrink-0 mb-6";

/** `!` overrides default TabsTrigger active primary fill from `components/ui/tabs.tsx`. */
export const CARD_CONTROLS_TAB_TRIGGER_CLASS =
  "rounded-[10px] h-full border border-transparent text-[var(--color-text-muted)] transition-all hover:bg-white/[0.03] hover:text-white/60 data-[state=active]:!bg-white/[0.05] data-[state=active]:!border-transparent data-[state=active]:!text-[#0D90FF] data-[state=active]:!shadow-none";
