import type { ZoomSettings, GeographyStyles, ProjectionConfig } from "./types";

export const DEFAULT_GEO_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export const DEFAULT_PROJECTION_CONFIG: ProjectionConfig = {
    scale: 147,
    center: [20, 30],
};

export const DEFAULT_ZOOM_CONFIG: ZoomSettings = {
    initial: 1.2,
    min: 1,
    max: 8,
};

export const DEFAULT_GEOGRAPHY_STYLES: GeographyStyles = {
    fill: "var(--color-map-fill, #d1d5db)",
    stroke: "var(--color-map-stroke, #e5e7eb)",
    strokeWidth: 0.5,
    hoverFill: "var(--color-map-hover, #9ca3af)",
};
