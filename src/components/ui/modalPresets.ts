export const FULL_MODAL_OVERLAY_CLASS =
  "notifications-modal-overlay z-[110] bg-[var(--color-bg-modal-overlay)]";

/** Opaque solid gray plate — required for two-layer shell to read correctly. */
export const ONBOARDING_MODAL_OVERLAY_CLASS =
  "onboarding-modal-overlay z-[110] bg-black/30";

/** Stripe-style wide double-layer shell. */
export const ONBOARDING_MODAL_SHELL_CLASS =
  "onboarding-modal-dialog z-[110] flex min-h-0 flex-col gap-0 overflow-hidden p-[12px] w-[calc(100vw-8rem)] max-w-[calc(100vw-8rem)] h-[calc(100dvh-6rem)] !rounded-[56px] backdrop-blur-md shadow-xl";

export const ONBOARDING_MODAL_INNER_CLASS =
  "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[44px] border !backdrop-blur-none";

export const FULL_MODAL_SURFACE_CLASS =
  "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 overflow-hidden p-0 rounded-[var(--radius-card)] border border-[var(--color-border-table)] bg-[var(--color-bg-glass)] backdrop-blur-[var(--glass-blur)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur-modal)] dark:shadow-lg";

/** Compact glass form dialogs (report issue, feedback, etc.). */
export const FORM_MODAL_SHELL_CLASS =
  "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-2 h-auto w-[calc(100vw-2rem)] max-w-[min(36rem,calc(100vw-2rem))] !rounded-[32px] backdrop-blur-md shadow-xl";

/** Fixed height — form and success steps must not resize the shell. */
export const FORM_MODAL_INNER_CLASS =
  "relative flex h-[320px] w-full min-h-[320px] max-h-[320px] flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

/** Send / receive wallet modals — scrollable body, capped to viewport. */
export const WALLET_TRANSFER_MODAL_INNER_CLASS =
  "relative flex max-h-[min(640px,calc(100dvh-4rem))] min-h-[min(440px,calc(100dvh-6rem))] w-full flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

/** Primary submit — anchored bottom-right in form modal footers. */
export const FORM_MODAL_SUBMIT_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[10px] border-none bg-[var(--color-cta-button-bg)] px-4 text-xs font-medium text-white transition-colors hover:bg-[var(--color-cta-button-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40";

/** Compact double-layer glass shell — outer gutter (dropdowns, small panels). */
export const COMPACT_GLASS_SHELL_OUTER_CLASS =
  "overflow-hidden p-2 gap-0 rounded-[32px] backdrop-blur-md shadow-xl";

export const COMPACT_GLASS_SHELL_OUTER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

export const COMPACT_GLASS_SHELL_INNER_CLASS =
  "relative flex flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

export const COMPACT_GLASS_SHELL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;
