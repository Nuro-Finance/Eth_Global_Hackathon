"use client";

import { memo } from "react";
import { Geographies, Geography } from "react-simple-maps";
import type { GeographyStyles } from "../types";
import { DEFAULT_GEOGRAPHY_STYLES, DEFAULT_GEO_URL } from "../config";

interface MapGeographiesProps {
  geoUrl?: string;
  styles?: GeographyStyles;
  onGeographiesRender?: (geographies: object[]) => void;
}

const MapGeographies = memo<MapGeographiesProps>(function MapGeographies({
  geoUrl = DEFAULT_GEO_URL,
  styles: customStyles,
  onGeographiesRender,
}) {
  const styles = { ...DEFAULT_GEOGRAPHY_STYLES, ...customStyles };

  return (
    <Geographies geography={geoUrl}>
      {({ geographies }) => {
 // Notify when geographies are loaded
        if (geographies.length > 0 && onGeographiesRender) {
          setTimeout(() => onGeographiesRender(geographies), 0);
        }

        return geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={styles.fill}
            stroke={styles.stroke}
            strokeWidth={styles.strokeWidth}
            style={{
              default: { outline: "none" },
              hover: {
                fill: styles.hoverFill,
                outline: "none",
              },
              pressed: { outline: "none" },
            }}
          />
        ));
      }}
    </Geographies>
  );
});

export default MapGeographies;
