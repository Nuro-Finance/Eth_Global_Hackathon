"use client";

import { ComposableMap, ZoomableGroup } from "react-simple-maps";
import type { WorldMapProps } from "./types";
import { DEFAULT_PROJECTION_CONFIG, DEFAULT_GEO_URL } from "./config";
import { useMapPosition, useGeographies } from "./hooks";
import { ZoomControls, MapGeographies } from "./components";

/**
 * WorldMap - Reusable interactive world map component with built-in zoom controls
 */
export function WorldMap({
  initialPosition,
  onPositionChange,
  onGeographiesLoad,
  children,
  geoUrl = DEFAULT_GEO_URL,
  projectionConfig = DEFAULT_PROJECTION_CONFIG,
  zoomSettings,
  showZoomControls = true,
  geographyStyles,
  className,
}: WorldMapProps) {
  const { position, zoom, handleMoveEnd, handleZoomIn, handleZoomOut } =
    useMapPosition({
      initialPosition,
      projectionConfig,
      zoomSettings,
      onPositionChange,
    });

  const { handleGeographiesRender } = useGeographies({
    onGeographiesLoad,
  });

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Zoom Controls */}
      {showZoomControls && (
        <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
      )}

      {/* Map */}
      <ComposableMap
        projectionConfig={projectionConfig}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          onMoveEnd={handleMoveEnd}
          minZoom={zoom.min}
          maxZoom={zoom.max}
        >
          <MapGeographies
            geoUrl={geoUrl}
            styles={geographyStyles}
            onGeographiesRender={handleGeographiesRender}
          />
          {children}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

export default WorldMap;

// Re-exports
export * from "./types";
export * from "./config";
export * from "./hooks";
export * from "./components";
