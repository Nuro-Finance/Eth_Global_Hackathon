"use client";

import { HomeResponsiveShell } from "./homeResponsiveShared";

/** md1 (768–959px) */
export default function HomeResponsiveMd1() {
  return (
    <HomeResponsiveShell
      cardLayout="squish"
      transactionsSubtitleCompact
      transactionsHiddenColumns={["status", "category"]}
    />
  );
}
