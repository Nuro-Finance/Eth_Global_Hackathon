"use client";

import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import { Marker } from "react-simple-maps";
import { type TransferUser } from "../config/worldMap.config";

interface TransferMarkersProps {
  transfers: TransferUser[];
  isMapLoading: boolean;
  onSelectTransfer: (transfer: TransferUser) => void;
}

/**
 * Transfer markers on the map
 */
export function TransferMarkers({
  transfers,
  isMapLoading,
  onSelectTransfer,
}: TransferMarkersProps) {
  if (isMapLoading) return null;

  return (
    <>
      {transfers.map((transfer) => (
        <Marker
          key={transfer.id}
          coordinates={transfer.coordinates}
          onClick={() => onSelectTransfer(transfer)}
        >
          <g className="cursor-pointer">
            <circle
              r={8}
              fill={
                transfer.type === "received"
                  ? "var(--color-success)"
                  : "var(--color-warning)"
              }
              fillOpacity={0.3}
              className="animate-ping"
            />
            <circle
              r={6}
              fill="var(--color-bg-primary)"
              stroke={
                transfer.type === "received"
                  ? "var(--color-success)"
                  : "var(--color-warning)"
              }
              strokeWidth={2}
            />
            <image
              href={transfer.avatar}
              x="-4"
              y="-4"
              width={8}
              height={8}
              clipPath="circle(4px at center)"
              preserveAspectRatio="xMidYMid slice"
            />
            <g transform="translate(6, -10)">
              {transfer.type === "received" ? (
                <IconArrowDownRight
                  size={14}
                  color="var(--color-success)"
                  stroke={2.5}
                />
              ) : (
                <IconArrowUpRight
                  size={14}
                  color="var(--color-warning)"
                  stroke={2.5}
                />
              )}
            </g>
          </g>
        </Marker>
      ))}
    </>
  );
}
