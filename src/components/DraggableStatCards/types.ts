import { ReactNode } from "react";

/**
 * Data structure for a single stat item
 */
export interface StatData {
    /** Unique identifier for the stat */
    id: string;
    /** Statistic title */
    title: string;
    /** Main value to display */
    value: string | number;
    /** Percentage change (optional) */
    change?: number;
    /** Whether the change is positive (green) or negative (red) */
    isPositive?: boolean;
    /** Icon to display */
    icon?: ReactNode;
    /** Whether to show the change indicator */
    showChange?: boolean;
    /** Click handler */
    onClick?: () => void;
}

/**
 * Props for the DraggableStatsGrid component
 */
export interface DraggableStatsGridProps {
    /** Unique storage key for localStorage persistence */
    storageKey: string;
    /** Array of statistics data */
    stats: StatData[];
    /** Whether drag and drop is enabled */
    isDraggable?: boolean;
    /** Grid layout classes */
    gridClassName?: string;
    /** Additional CSS classes */
    className?: string;
    /** Skeleton values while data reloads (initial load or refresh). */
    isLoading?: boolean;
}

/**
 * Props for the StatCard component
 */
export interface StatCardProps {
    /** Unique identifier for drag and drop */
    id: string;
    /** Statistic title */
    title: string;
    /** Main value to display */
    value: string | number;
    /** Percentage change (optional) */
    change?: number;
    /** Whether the change is positive (green) or negative (red) */
    isPositive?: boolean;
    /** Additional icon or content */
    icon?: ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: () => void;
    /** Whether to show the change indicator */
    showChange?: boolean;
    /** Whether this is being rendered as a drag overlay */
    isDragOverlay?: boolean;
    /** Whether drag and drop is enabled */
    isDraggable?: boolean;
    /** Skeleton value while data reloads. */
    isLoading?: boolean;
}
