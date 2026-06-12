// Sidebar dimension constants
export const SIDEBAR_WIDTH = {
    EXPANDED: "240px",
    COLLAPSED: "64px",
} as const;

// Animation duration in milliseconds
export const ANIMATION_DURATION = 300;

// Tailwind animation classes
export const ANIMATION_CLASSES = {
    base: "transition-all duration-300 ease-in-out",
    fast: "transition-all duration-200 ease-in-out",
    slow: "transition-all duration-500 ease-in-out",
} as const;
