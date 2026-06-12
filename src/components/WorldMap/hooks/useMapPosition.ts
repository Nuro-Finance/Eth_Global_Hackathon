"use client";

import { useState, useCallback, useEffect } from "react";
import type { MapPosition, ZoomSettings, ProjectionConfig } from "../types";
import { DEFAULT_ZOOM_CONFIG, DEFAULT_PROJECTION_CONFIG } from "../config";

interface UseMapPositionProps {
    initialPosition?: MapPosition;
    projectionConfig?: ProjectionConfig;
    zoomSettings?: ZoomSettings;
    onPositionChange?: (position: MapPosition) => void;
}

export function useMapPosition({
    initialPosition,
    projectionConfig = DEFAULT_PROJECTION_CONFIG,
    zoomSettings = DEFAULT_ZOOM_CONFIG,
    onPositionChange,
}: UseMapPositionProps) {
    // Merge zoom settings with defaults
    const zoom = { ...DEFAULT_ZOOM_CONFIG, ...zoomSettings };

    // Create default position from config
    const defaultPosition: MapPosition = {
        coordinates: projectionConfig.center ?? DEFAULT_PROJECTION_CONFIG.center!,
        zoom: zoom.initial ?? DEFAULT_ZOOM_CONFIG.initial!,
    };

    // Use initial position if provided, otherwise use default
    const [position, setPosition] = useState<MapPosition>(
        initialPosition ?? defaultPosition
    );

    // Update position when initialPosition changes
    useEffect(() => {
        if (initialPosition) {
            setPosition(initialPosition);
        }
    }, [initialPosition?.coordinates?.[0], initialPosition?.coordinates?.[1], initialPosition?.zoom]);

    const updatePosition = useCallback(
        (newPosition: MapPosition) => {
            setPosition(newPosition);
            onPositionChange?.(newPosition);
        },
        [onPositionChange]
    );

    const handleMoveEnd = useCallback(
        (newPosition: MapPosition) => {
            updatePosition(newPosition);
        },
        [updatePosition]
    );

    const handleZoomIn = useCallback(() => {
        const maxZoom = zoom.max ?? 8;
        if (position.zoom >= maxZoom) return;

        const newZoom = Math.min(position.zoom * 1.5, maxZoom);
        updatePosition({ ...position, zoom: newZoom });
    }, [position, zoom.max, updatePosition]);

    const handleZoomOut = useCallback(() => {
        const minZoom = zoom.min ?? 1;
        if (position.zoom <= minZoom) return;

        const newZoom = Math.max(position.zoom / 1.5, minZoom);
        updatePosition({ ...position, zoom: newZoom });
    }, [position, zoom.min, updatePosition]);

    return {
        position,
        zoom,
        handleMoveEnd,
        handleZoomIn,
        handleZoomOut,
    };
}
