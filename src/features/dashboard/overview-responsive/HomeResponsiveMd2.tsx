"use client";

import { HomeResponsiveShell } from "./homeResponsiveShared";

/** md2 (960–1023px) - standard row, square card (no tilt), Reload Card + Withdraw */
export default function HomeResponsiveMd2() {
  return (
    <HomeResponsiveShell
      cardLayout="flat"
      transactionsHiddenColumns={["category"]}
      transactionsStatusCompact
    />
  );
}
