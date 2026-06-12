"use client";

import Image from "next/image";
import {
  IconWorld,
  IconArrowUpRight,
  IconArrowDownRight,
  IconX,
} from "@tabler/icons-react";
import { type TransferUser } from "../config/worldMap.config";

interface TransferDetailsProps {
  transfer: TransferUser | null;
  onClose: () => void;
}

/**
 * Selected transfer details card
 */
export function TransferDetails({ transfer, onClose }: TransferDetailsProps) {
  if (!transfer) return null;

  return (
    <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 bg-[var(--color-bg-primary)]/95 backdrop-blur-lg border border-[var(--color-border-primary)] rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-2xl">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-[var(--color-bg-hover)] transition-colors"
        aria-label="Close"
      >
        <IconX
          size={16}
          className="text-[var(--color-text-muted)]"
          stroke={2}
        />
      </button>
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Avatar with Status */}
        <div className="relative">
          <Image
            src={transfer.avatar}
            alt={transfer.name}
            width={40}
            height={40}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover ring-2 ring-[var(--color-border-primary)]"
          />
          <div
            className={`absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-[var(--color-bg-primary)] flex items-center justify-center ${
              transfer.type === "received"
                ? "bg-[var(--color-success)]"
                : "bg-[var(--color-error)]"
            }`}
          >
            {transfer.type === "received" ? (
              <IconArrowDownRight size={8} className="text-[var(--color-text-primary)]" stroke={3} />
            ) : (
              <IconArrowUpRight size={8} className="text-[var(--color-text-primary)]" stroke={3} />
            )}
          </div>
        </div>

        {/* Transfer Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <h4 className="font-semibold text-[var(--color-text-primary)] text-sm sm:text-base truncate">
              {transfer.name}
            </h4>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                transfer.type === "received"
                  ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                  : "bg-[var(--color-error)]/20 text-[var(--color-error)]"
              }`}
            >
              {transfer.type === "received" ? "Received" : "Sent"}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[var(--color-text-muted)]">
            <span className="flex items-center gap-0.5 sm:gap-1">
              <IconWorld size={12} stroke={1.5} />
              {transfer.country}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{transfer.time}</span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right">
          <div
            className={`text-base sm:text-xl font-bold mb-0.5 sm:mb-1 ${
              transfer.type === "received"
                ? "text-[var(--color-success)]"
                : "text-[var(--color-error)]"
            }`}
          >
            {transfer.type === "received" ? "+" : "-"}$
            {transfer.amount.toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm text-[var(--color-text-muted)] uppercase tracking-wide">
            {transfer.currency}
          </div>
        </div>
      </div>
    </div>
  );
}
