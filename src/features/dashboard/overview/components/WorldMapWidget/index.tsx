"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WorldMap, type MapPosition } from "@/components";
import { WidgetCard } from "../../shared";
import {
  transfersData,
  mapConfig,
  type TransferUser,
} from "./config/worldMap.config";
import { TransferDetails, TransferMarkers } from "./components";

// Default position based on config
const DEFAULT_POSITION: MapPosition = {
  coordinates: mapConfig.projection.center,
  zoom: mapConfig.zoom.initial,
};

/**
 * WorldMapWidget - Interactive world map showing global transfers
 */
export function WorldMapWidget() {
  const t = useTranslations();
  const [selectedTransfer, setSelectedTransfer] = useState<TransferUser | null>(
    null
  );

  const handleSelectTransfer = (transfer: TransferUser) => {
    setSelectedTransfer(transfer);
  };

  return (
    <WidgetCard
      title={t("Dashboard.globalTransfers") || "Global Transfers"}
      subtitle={
        t("Dashboard.recentTransfersWorld") ||
        "Recent transfers around the world"
      }
      action={{
        type: "link",
        label: t("Dashboard.showMore") || "Show more",
      }}
      className="col-span-full xl:col-span-2"
      fullHeight={true}
    >
      <div className="relative flex-1 rounded-lg overflow-hidden bg-[var(--color-bg-secondary)]">
        <WorldMap
          initialPosition={DEFAULT_POSITION}
          showZoomControls={true}
          projectionConfig={mapConfig.projection}
          zoomSettings={mapConfig.zoom}
          className="h-full"
        >
          <TransferMarkers
            transfers={transfersData}
            isMapLoading={false}
            onSelectTransfer={handleSelectTransfer}
          />
        </WorldMap>
        <TransferDetails
          transfer={selectedTransfer}
          onClose={() => setSelectedTransfer(null)}
        />
      </div>
    </WidgetCard>
  );
}

export default WorldMapWidget;
