"use client";

import dynamic from "next/dynamic";

/**
 * Phase 4 (NUR-26): root dashboard page now mounts Chris's OverviewVariant3
 * (the focused hero + transactions layout from his May 4 zip handoff).
 *
 * The previous DashboardGrid (multi-panel layout with BarChart + Statistics
 * + WorldMap + SmartInvest panels) is preserved in archive/pre-mvp-2026-05-07
 * branch + accessible via tag pre-mvp-cuts-2026-05-07. Restore via:
 * git checkout pre-mvp-cuts-2026-05-07 -- src/features/dashboard/overview/layouts/DashboardGrid
 *
 * Variant 3 = single hero row (3 KPI tiles + card carousel + Cash Flow chart
 * + Card Usage panel) + transactions list. Matches the screen Chris demoed
 * in 1.mp4 (the 5/4/26 walkthrough). All chart data is wired through real
 * /api/transactions via useCashFlowData -- no fake mock arrays.
 */
const OverviewVariant3 = dynamic(
  () => import("@/features/dashboard/overview/layouts/OverviewVariants/OverviewVariant3"),
  {
    ssr: false,
  }
);

export default function DashboardPage() {
  return <OverviewVariant3 />;
}
