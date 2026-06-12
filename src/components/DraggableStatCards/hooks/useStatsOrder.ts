"use client";

import { useState, useEffect, useCallback } from "react";
import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { StatData } from "../types";
import { STORAGE_KEY_PREFIX } from "../config";

interface UseStatsOrderOptions {
    /** Unique storage key for localStorage */
    storageKey: string;
    /** Initial stats data */
    initialStats: StatData[];
}

interface UseStatsOrderReturn {
    /** Current ordered stats */
    stats: StatData[];
    /** Currently dragged item ID */
    activeId: string | null;
    /** Currently active item data */
    activeItem: StatData | null;
    /** Handle drag start event */
    handleDragStart: (event: DragStartEvent) => void;
    /** Handle drag end event */
    handleDragEnd: (event: DragEndEvent) => void;
    /** Handle drag cancel event */
    handleDragCancel: () => void;
    /** Reset stats order to initial */
    resetOrder: () => void;
}

/**
 * Get the full storage key for localStorage
 */
function getStorageKey(key: string): string {
    return `${STORAGE_KEY_PREFIX}${key}`;
}

/**
 * Load stats order from localStorage
 */
function loadOrderFromStorage(storageKey: string): string[] | null {
    if (typeof window === "undefined") return null;

    try {
        const stored = localStorage.getItem(getStorageKey(storageKey));
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn("Failed to load stats order from localStorage:", error);
    }
    return null;
}

/**
 * Save order (IDs only) to localStorage
 */
function saveOrderToStorage(storageKey: string, order: string[]): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(getStorageKey(storageKey), JSON.stringify(order));
    } catch (error) {
        console.warn("Failed to save stats order to localStorage:", error);
    }
}

/**
 * Reorder stats based on stored order IDs
 * This takes the fresh initialStats (with current translations) and reorders them
 */
function reorderStats(stats: StatData[], order: string[]): StatData[] {
    const statsMap = new Map(stats.map((stat) => [stat.id, stat]));
    const ordered: StatData[] = [];

    // Add stats in stored order
    for (const id of order) {
        const stat = statsMap.get(id);
        if (stat) {
            ordered.push(stat);
            statsMap.delete(id);
        }
    }

    // Add any remaining stats (new ones not in storage)
    for (const stat of statsMap.values()) {
        ordered.push(stat);
    }

    return ordered;
}

/**
 * Hook for managing stats order with localStorage persistence
 * Only stores order (IDs), not the actual stat data
 */
export function useStatsOrder({
    storageKey,
    initialStats,
}: UseStatsOrderOptions): UseStatsOrderReturn {
    // Store only the order (IDs), not the stats themselves
    const [order, setOrder] = useState<string[]>(() => {
        const storedOrder = loadOrderFromStorage(storageKey);
        return storedOrder || initialStats.map(s => s.id);
    });

    const [activeId, setActiveId] = useState<string | null>(null);

    // Compute stats by reordering initialStats based on stored order
    // This ensures we always use fresh data from initialStats (with current translations)
    const stats = reorderStats(initialStats, order);

    // Update order when initialStats IDs change (new stats added/removed)
    useEffect(() => {
        const currentIds = new Set(initialStats.map(s => s.id));
        const storedOrder = loadOrderFromStorage(storageKey);

        if (storedOrder) {
            // Filter out IDs that no longer exist and add new ones
            const validOrder = storedOrder.filter(id => currentIds.has(id));
            const newIds = initialStats
                .map(s => s.id)
                .filter(id => !storedOrder.includes(id));

            setOrder([...validOrder, ...newIds]);
        } else {
            setOrder(initialStats.map(s => s.id));
        }
    }, [initialStats, storageKey]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    }, []);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;

            if (over && active.id !== over.id) {
                setOrder((currentOrder) => {
                    const oldIndex = currentOrder.findIndex((id) => id === active.id);
                    const newIndex = currentOrder.findIndex((id) => id === over.id);
                    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);

                    // Save only the order (IDs) to localStorage
                    saveOrderToStorage(storageKey, newOrder);

                    return newOrder;
                });
            }

            setActiveId(null);
        },
        [storageKey]
    );

    const handleDragCancel = useCallback(() => {
        setActiveId(null);
    }, []);

    const resetOrder = useCallback(() => {
        const defaultOrder = initialStats.map(s => s.id);
        setOrder(defaultOrder);
        if (typeof window !== "undefined") {
            localStorage.removeItem(getStorageKey(storageKey));
        }
    }, [initialStats, storageKey]);

    const activeItem = activeId ? stats.find((stat) => stat.id === activeId) || null : null;

    return {
        stats,
        activeId,
        activeItem,
        handleDragStart,
        handleDragEnd,
        handleDragCancel,
        resetOrder,
    };
}
