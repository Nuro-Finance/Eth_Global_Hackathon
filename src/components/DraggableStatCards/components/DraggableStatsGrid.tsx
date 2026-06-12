"use client";

import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";
import { createPortal } from "react-dom";

import { DraggableStatsGridProps } from "../types";
import { DEFAULT_GRID_CLASS } from "../config";
import { useStatsOrder, useDragSensors } from "../hooks";
import { StatCard } from "./StatCard";

/**
 * DraggableStatsGrid - A grid of draggable statistics cards
 * Features:
 * - Drag and drop reordering
 * - localStorage persistence of order
 * - Responsive grid layout
 * - No rotation effect during drag
 */
export function DraggableStatsGrid({
  storageKey,
  stats: initialStats,
  isDraggable = true,
  gridClassName = DEFAULT_GRID_CLASS,
  className = "",
  isLoading = false,
}: DraggableStatsGridProps) {
  const sensors = useDragSensors();

  const { stats, activeId, handleDragStart, handleDragEnd, handleDragCancel } =
    useStatsOrder({
      storageKey,
      initialStats,
    });

 // Extract IDs for SortableContext (must be stable reference)
  const itemIds = useMemo(() => stats.map((s) => s.id), [stats]);

 // Find active item for the DragOverlay
  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return stats.find((stat) => stat.id === activeId) || null;
  }, [activeId, stats]);

 // If drag and drop is disabled, render simple grid
  if (!isDraggable) {
    return (
      <div className={`${gridClassName} ${className}`}>
        {stats.map((stat) => (
          <StatCard
            key={stat.id}
            id={stat.id}
            title={stat.title}
            value={stat.value}
            change={stat.change}
            isPositive={stat.isPositive}
            icon={stat.icon}
            showChange={stat.showChange}
            onClick={stat.onClick}
            isDraggable={false}
            isLoading={isLoading}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className={gridClassName}>
            {stats.map((stat) => (
              <StatCard
                key={stat.id}
                id={stat.id}
                title={stat.title}
                value={stat.value}
                change={stat.change}
                isPositive={stat.isPositive}
                icon={stat.icon}
                showChange={stat.showChange}
                onClick={stat.onClick}
                isDraggable={true}
                isLoading={isLoading}
              />
            ))}
          </div>
        </SortableContext>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={9999}>
              {activeItem ? (
                <StatCard
                  id={activeItem.id}
                  title={activeItem.title}
                  value={activeItem.value}
                  change={activeItem.change}
                  isPositive={activeItem.isPositive}
                  icon={activeItem.icon}
                  showChange={activeItem.showChange}
                  isDragOverlay={true}
                  isDraggable={false}
                />
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </div>
  );
}
