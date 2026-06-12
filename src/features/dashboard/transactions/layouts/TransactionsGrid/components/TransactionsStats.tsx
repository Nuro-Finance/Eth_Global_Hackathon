"use client";

import { DraggableStatsGrid, type StatData } from "@/components";

interface TransactionsStatsProps {
  stats: StatData[];
  isLoading?: boolean;
}

/**
 * TransactionsStats - Displays transaction statistics grid
 */
export function TransactionsStats({ stats, isLoading = false }: TransactionsStatsProps) {
  return (
    <DraggableStatsGrid
      storageKey="transactions-stats"
      stats={stats}
      isDraggable={true}
      isLoading={isLoading}
      gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    />
  );
}
