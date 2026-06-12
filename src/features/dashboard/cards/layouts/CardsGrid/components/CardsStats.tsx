"use client";

import { DraggableStatsGrid, type StatData } from "@/components";

interface CardsStatsProps {
  stats: StatData[];
  isLoading?: boolean;
}

/**
 * CardsStats - Displays card statistics grid
 */
export function CardsStats({ stats, isLoading = false }: CardsStatsProps) {
  return (
    <DraggableStatsGrid
      storageKey="my-card-stats"
      stats={stats}
      isDraggable={true}
      isLoading={isLoading}
      gridClassName="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-4"
    />
  );
}
