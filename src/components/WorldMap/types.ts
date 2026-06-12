export interface MapPosition {
    coordinates: [number, number];
    zoom: number;
}

export interface ZoomSettings {
 /** Initial/default zoom level */
    initial?: number;
 /** Minimum zoom level */
    min?: number;
 /** Maximum zoom level */
    max?: number;
}

export interface GeographyStyles {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    hoverFill?: string;
}

export interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
}

export interface WorldMapProps {
 /** Initial map position (coordinates and zoom) */
    initialPosition?: MapPosition;
 /** Callback when position changes */
    onPositionChange?: (position: MapPosition) => void;
 /** Callback when geographies finish loading */
    onGeographiesLoad?: (geographies: object[]) => void;
 /** Children to render inside the zoomable group (e.g., markers) */
    children?: React.ReactNode;
 /** Custom geography URL */
    geoUrl?: string;
 /** Map projection config */
    projectionConfig?: ProjectionConfig;
 /** Zoom settings (initial, min, max) */
    zoomSettings?: ZoomSettings;
 /** Whether to show zoom controls */
    showZoomControls?: boolean;
 /** Geography styling */
    geographyStyles?: GeographyStyles;
 /** Custom class for the container */
    className?: string;
}
