/**
 * Default grid class for stats layout
 */
export const DEFAULT_GRID_CLASS = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5";

/**
 * LocalStorage key prefix for stats order
 */
export const STORAGE_KEY_PREFIX = "draggable-stats-order-";

/**
 * Drag overlay animation configuration
 * dropAnimation set to null to prevent "falling from sky" effect
 */
export const DRAG_OVERLAY_CONFIG = {
    adjustScale: false,
    dropAnimation: null,
} as const;

/**
 * Pointer sensor activation constraint
 */
export const POINTER_SENSOR_CONFIG = {
    activationConstraint: {
        distance: 8,
    },
} as const;
