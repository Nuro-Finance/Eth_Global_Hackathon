"use client";

import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatCardProps } from "../types";
import { StatCardContent } from "./StatCardContent";

// Disable animation when item is dropped (wasDragging)
const animateLayoutChanges = (
  args: Parameters<typeof defaultAnimateLayoutChanges>[0]
) => {
  const { isSorting, wasDragging } = args;
  if (wasDragging) {
    return false; // No animation after drop
  }
  return defaultAnimateLayoutChanges(args);
};

/**
 * Base card styles
 */
const BASE_CARD_STYLES =
  "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border-none p-4 transition-[background-color,box-shadow] duration-200 flex flex-col h-full min-h-[120px] overflow-hidden";

/**
 * Overlay card styles (for DragOverlay - follows cursor)
 */
const OVERLAY_CARD_STYLES =
  "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border-none p-4 shadow-md scale-[1.02] flex flex-col min-h-[120px] overflow-hidden";

/**
 * Placeholder styles when this card is being dragged
 */
const PLACEHOLDER_STYLES =
  "bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] rounded-[20px] border-2 border-dashed border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] p-4 flex flex-col h-full min-h-[120px] opacity-50";

/**
 * StatCard - A draggable statistics card component
 *
 * When isDragOverlay=true: Renders a simple styled card for DragOverlay (no sortable hooks)
 * When isDragging: Shows a placeholder in the original position
 * Otherwise: Renders the full interactive card with drag capabilities
 */
export function StatCard({
  id,
  title,
  value,
  change,
  isPositive = true,
  icon,
  className = "",
  onClick,
  showChange = true,
  isDragOverlay = false,
  isDraggable = true,
  isLoading = false,
}: StatCardProps) {
  // For overlay cards, render immediately without hooks
  // This is rendered inside DragOverlay and follows the cursor
  if (isDragOverlay) {
    return (
      <div className={`${OVERLAY_CARD_STYLES} ${className}`}>
        <StatCardContent
          title={title}
          value={value}
          change={change}
          isPositive={isPositive}
          icon={icon}
          showChange={showChange}
          isDraggable={true}
          isLoading={isLoading}
        />
      </div>
    );
  }

  // For sortable cards, use the hook
  return (
    <SortableStatCard
      id={id}
      title={title}
      value={value}
      change={change}
      isPositive={isPositive}
      icon={icon}
      className={className}
      onClick={onClick}
      showChange={showChange}
      isDraggable={isDraggable}
      isLoading={isLoading}
    />
  );
}

/**
 * Inner component that uses useSortable hook
 * Separated to avoid calling hooks conditionally
 */
function SortableStatCard({
  id,
  title,
  value,
  change,
  isPositive = true,
  icon,
  className = "",
  onClick,
  showChange = true,
  isDraggable = true,
  isLoading = false,
}: Omit<StatCardProps, "isDragOverlay">) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: !isDraggable,
    animateLayoutChanges, // Disable animation after drop
  });

  // Apply transform and transition from dnd-kit for smooth animations
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Show placeholder when this card is being dragged
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className={PLACEHOLDER_STYLES} />
    );
  }

  const Component = onClick ? "button" : "div";

  return (
    <Component
      ref={isDraggable ? setNodeRef : undefined}
      style={isDraggable ? style : undefined}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
      className={`${BASE_CARD_STYLES} ${
        isDraggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${onClick ? "cursor-pointer" : ""}  ${className}`}
      onClick={onClick}
    >
      <StatCardContent
        title={title}
        value={value}
        change={change}
        isPositive={isPositive}
        icon={icon}
        showChange={showChange}
        isDraggable={isDraggable}
        isLoading={isLoading}
      />
    </Component>
  );
}
