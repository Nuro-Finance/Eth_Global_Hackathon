"use client";

import { DraggableStatsGrid, type StatData } from "@/components";

interface AnalyticsStatsProps {
  stats: StatData[];
}

/**
 * AnalyticsStats - Displays analytics statistics grid
 */
export function AnalyticsStats({ stats }: AnalyticsStatsProps) {
  return (
    <DraggableStatsGrid
      storageKey="analytics-stats"
      stats={stats}
      isDraggable={true}
      gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    />
  );
}
