"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { type StockData } from "../../../config/smartInvest.config";

const BetModal = dynamic(() => import("../../BetModal"), { ssr: false });

interface StockItemProps extends StockData {}

export function StockItem({
  name,
  symbol,
  price,
  change,
  logo,
  isPositive,
  url,
  yesPct,
  noPct,
  marketId,
}: StockItemProps) {
  const [betOpen, setBetOpen] = useState(false);
  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <div 
        className="rounded-[13px] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] p-2.5 sm:p-3 mb-1.5 sm:mb-2 transition-all duration-200 cursor-pointer group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ 
          backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : undefined 
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="flex bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-input)] items-center justify-center rounded-full w-8 h-8 sm:w-10 sm:h-10 overflow-hidden shrink-0 cursor-pointer"
            onClick={() => { setBetSide("yes"); setBetOpen(true); }}
          >
            <div className="w-full h-full flex items-center justify-center text-[var(--color-text-primary)]">{logo.icon}</div>
          </div>

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => { setBetSide("yes"); setBetOpen(true); }}
            style={{ textAlign: "start" as const }}
          >
            <div className="text-[var(--color-text-primary)] text-[11px] sm:text-[12px] font-normal truncate leading-tight">
              {name}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              {price}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => { setBetSide("yes"); setBetOpen(true); }}
              className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-white/[0.04] text-emerald-400 hover:bg-white/[0.06] transition-colors"
            >
              {yesPct ?? 0}¢ Yes
            </button>
            <button
              onClick={() => { setBetSide("no"); setBetOpen(true); }}
              className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-white/[0.04] text-red-400 hover:bg-white/[0.06] transition-colors"
            >
              {noPct ?? 0}¢ No
            </button>
          </div>
        </div>
      </div>

      {mounted && betOpen && createPortal(
        <BetModal
          open={betOpen}
          onClose={() => setBetOpen(false)}
          marketName={name}
          marketId={marketId || ""}
          yesPct={yesPct ?? 50}
          noPct={noPct ?? 50}
        />,
        document.body
      )}
    </>
  );
}
