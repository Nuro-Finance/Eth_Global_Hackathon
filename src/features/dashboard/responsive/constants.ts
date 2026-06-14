/**
 * Pass B - five layout tiers. Switch only in `DashboardResponsivePage`.
 * See /responsiveness-plan.md
 */

export type DashboardLayoutTier = "sm" | "md1" | "md2" | "md3" | "xl";

/** sm: below Tailwind `md` */
export const DASHBOARD_SM_MAX_PX = 767;

/** md1: 768–959 */
export const DASHBOARD_MD1_MIN_PX = 768;
export const DASHBOARD_MD1_MAX_PX = 959;
/** md1 low end only (768–790): hide balance “USD” just above sm @ 767 */
export const DASHBOARD_MD1_USD_HIDE_MIN_PX = 768;
export const DASHBOARD_MD1_USD_HIDE_MAX_PX = 790;

/** md2: 960–1023 */
export const DASHBOARD_MD2_MIN_PX = 960;
export const DASHBOARD_MD2_MAX_PX = 1023;

/** md3: 1024–1279 (5.4.26 tablet row) */
export const DASHBOARD_MD3_MIN_PX = 1024;
export const DASHBOARD_MD3_MAX_PX = 1279;

/** xl: Tailwind `xl`+ */
export const DASHBOARD_XL_MIN_PX = 1280;

/** @deprecated Use DASHBOARD_SM_MAX_PX */
export const DASHBOARD_MOBILE_MAX_PX = DASHBOARD_SM_MAX_PX;

/** @deprecated Use DASHBOARD_MD1_MIN_PX */
export const DASHBOARD_MD_MIN_PX = DASHBOARD_MD1_MIN_PX;

/** @deprecated Use DASHBOARD_MD3_MAX_PX - old “md” spanned md1–md3 */
export const DASHBOARD_MD_SQUISH_MAX_PX = DASHBOARD_MD2_MAX_PX;

/** @deprecated Use DASHBOARD_MD3_MIN_PX */
export const DASHBOARD_MD_MIDDLE_MIN_PX = DASHBOARD_MD3_MIN_PX;

/** @deprecated Use DASHBOARD_XL_MIN_PX */
export const DASHBOARD_TABLET_MIN_PX = DASHBOARD_MD1_MIN_PX;
export const DASHBOARD_DESKTOP_MIN_PX = DASHBOARD_XL_MIN_PX;
export const DASHBOARD_WIDE_MIN_PX = DASHBOARD_XL_MIN_PX;

export const DASHBOARD_PASS_B_GUTTER_CLASS = "gap-[16px]";

export const DASHBOARD_HOME_RESPONSIVE_LAB_PATH = "/dashboard/home-responsive";

/** Single active tier from viewport width - used only in `DashboardResponsivePage`. */
export function resolveDashboardLayoutTier(width: number): DashboardLayoutTier {
  if (width >= DASHBOARD_XL_MIN_PX) return "xl";
  if (width >= DASHBOARD_MD3_MIN_PX) return "md3";
  if (width >= DASHBOARD_MD2_MIN_PX) return "md2";
  if (width >= DASHBOARD_MD1_MIN_PX) return "md1";
  return "sm";
}

export function isResponsiveLabEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_SHOW_RESPONSIVE_LAB === "1"
  );
}
