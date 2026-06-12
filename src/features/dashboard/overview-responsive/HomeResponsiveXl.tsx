"use client";

import dynamic from "next/dynamic";

const OverviewVariant3 = dynamic(
  () => import("@/features/dashboard/overview/layouts/OverviewVariants/OverviewVariant3"),
  { ssr: false },
);

/** xl (1280px+) — layout 3 with SVG card stack clipped inside deck widget. */
export default function HomeResponsiveXl() {
  return <OverviewVariant3 homeResponsiveSvgDeck />;
}
