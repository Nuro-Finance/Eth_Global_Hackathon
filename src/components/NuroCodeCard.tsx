"use client";

import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";

export type NuroCodeCardProps = {
  balance: number;
  panMasked: string;
  expiry: string;
  cvv: string;
  sensitiveRevealed: boolean;
  onToggleSensitive?: () => void;
  cardHolderName?: string;
  cardName?: string;
  gradientStart?: string;
  gradientEnd?: string;
  hideDetails?: boolean;
  showStroke?: boolean;
  showShadow?: boolean;
  isLoading?: boolean;
};

export function NuroCodeCard({
  balance,
  panMasked,
  expiry,
  cvv,
  sensitiveRevealed,
  onToggleSensitive,
  cardHolderName = "CHRIS BRIGNOLA",
  cardName = "Anthropic API",
  gradientStart = "#171717",
  gradientEnd = "#171717",
  hideDetails = false,
  showStroke = true,
  showShadow = true,
  isLoading = false,
}: NuroCodeCardProps) {
  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(balance);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [cw, setCw] = React.useState<number>(316);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setCw(w);
    }
  }, []);

  React.useEffect(() => {
    if (!containerRef.current) return;
    let rafId: number;
    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (let entry of entries) {
          const newWidth = entry.contentRect.width;
          if (newWidth > 0) {
            setCw((prev) => (Math.abs(newWidth - prev) > 2 ? newWidth : prev));
          }
        }
      });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div 
      className="w-full h-full select-none" 
      ref={containerRef}
      style={{ "--cw": `${cw}px` } as React.CSSProperties}
    >
      <div
        className={cn("relative w-full h-full overflow-hidden", showShadow && "shadow-2xl")}
        style={{
          backgroundColor: "#171717",
          borderRadius: "calc(var(--cw) * 0.0585)",
        }}
      >
        {/* Stroke border */}
        <div
          className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border border-white/[0.06] transition-opacity duration-500"
          style={{ opacity: showStroke ? 1 : 0 }}
          aria-hidden
        />
        {/* Background N Logo */}
        <div
          className="absolute z-0 pointer-events-none"
          style={{
            left: "5.9%",
            right: "5.9%",
            top: "-25.59%",
            bottom: "-18.09%",
          }}
        >
          <img 
            src="/card-svg/Card%20Background%20N%20Logo.svg" 
            alt="" 
            draggable={false}
            className="w-full h-full object-contain pointer-events-none select-none" 
          />
        </div>

        {/* Ambient reflection glow */}
        <div className="absolute -top-[50%] -left-[20%] w-[100%] h-[100%] rounded-full bg-white/[0.02] blur-3xl pointer-events-none z-0" />

        {/* Nuro Word Mark (Top Right) */}
        <img
          src="/card-svg/nuro-word-mark.svg"
          alt="Nuro"
          draggable={false}
          className="absolute z-10 pointer-events-none select-none"
          style={{
            top: "7.74%",
            right: "5.7%",
            width: "19.6%",
            height: "auto",
            transform: "translateZ(1px)",
          }}
        />

        {/* Text Content - fills the space above the footer, never overlaps it */}
        {!hideDetails && (
          <div
            className="absolute z-10 flex flex-col justify-between overflow-hidden"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: "27.95%", // exactly the footer height
              padding: "calc(var(--cw) * 0.0475) calc(var(--cw) * 0.0625) calc(var(--cw) * 0.03) calc(var(--cw) * 0.0625)",
              transform: "translateZ(1px)",
            }}
          >
            {/* Top: Balance & Card Name */}
            <div className="flex flex-col min-w-0" style={{ gap: "calc(var(--cw) * 0.015)" }}>
              {isLoading ? (
                <WalletSkeletonText
                  className="w-fit font-semibold tracking-tight leading-none tabular-nums"
                  style={{ fontSize: "calc(var(--cw) * 0.065)" }}
                >
                  {formattedBalance}
                </WalletSkeletonText>
              ) : (
                <span
                  className="select-text font-semibold tracking-tight leading-none tabular-nums truncate text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
                  style={{ fontSize: "calc(var(--cw) * 0.065)" }}
                >
                  {formattedBalance}
                </span>
              )}
              {cardName && (
                <span className="select-text font-semibold text-white/60 tracking-wider leading-none truncate" style={{ fontSize: "calc(var(--cw) * 0.035)" }}>
                  {cardName}
                </span>
              )}
            </div>
            <div className="flex flex-col text-left min-w-0" style={{ gap: "calc(var(--cw) * 0.02)" }}>
              {/* Expiry & CVV */}
              <div className="flex font-medium leading-none whitespace-nowrap" style={{ fontSize: "calc(var(--cw) * 0.04)", gap: "calc(var(--cw) * 0.04)" }}>
                <span className="text-white/45">
                  Expires <strong className="text-white/80 font-semibold" style={{ marginLeft: "calc(var(--cw) * 0.005)" }}>{sensitiveRevealed ? expiry : "••/••"}</strong>
                </span>
                <span className="text-white/45">
                  CVV <strong className="text-white/80 font-semibold" style={{ marginLeft: "calc(var(--cw) * 0.005)" }}>{sensitiveRevealed ? cvv : "•••"}</strong>
                </span>
              </div>

              {/* Card Number */}
              <div className="flex items-center" style={{ gap: "calc(var(--cw) * 0.025)" }}>
                <span
                  className={cn(
                    "select-text font-semibold tracking-[0.08em] font-mono leading-none transition-colors duration-200 truncate",
                    sensitiveRevealed ? "text-white" : "text-white/55"
                  )}
                  style={{ fontSize: "calc(var(--cw) * 0.04)" }}
                >
                  {sensitiveRevealed ? panMasked : "•••• •••• •••• " + panMasked.slice(-4)}
                </span>

                {/* Eye toggle - always rendered to preserve layout, hidden when not interactive */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSensitive?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  className="shrink-0 flex items-center justify-center aspect-square text-white/45 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none"
                  style={{
                    padding: "calc(var(--cw) * 0.018)",
                    margin: "calc(var(--cw) * -0.01)",
                    borderRadius: "calc(var(--cw) * 0.025)",
                    visibility: onToggleSensitive ? "visible" : "hidden",
                    pointerEvents: onToggleSensitive ? "auto" : "none",
                  }}
                  aria-label={sensitiveRevealed ? "Hide Details" : "Show Details"}
                >
                  {sensitiveRevealed ? (
                    <EyeOff style={{ width: "calc(var(--cw) * 0.035)", height: "calc(var(--cw) * 0.035)" }} />
                  ) : (
                    <Eye style={{ width: "calc(var(--cw) * 0.035)", height: "calc(var(--cw) * 0.035)" }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── BOTTOM BAR ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between"
          style={{
            height: "27.95%",
            backgroundColor: "rgba(40, 40, 40, 0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            borderBottomLeftRadius: "calc(var(--cw) * 0.0585)",
            borderBottomRightRadius: "calc(var(--cw) * 0.0585)",
            paddingLeft: "6.25%",
            paddingRight: "6.25%",
            transform: "translateZ(1px)",
          }}
        >
          {/* Token SVGs */}
          <img 
            src="/card-svg/Token%20SVGs.svg" 
            alt="Crypto Tokens"
            draggable={false}
            className="pointer-events-none select-none"
            style={{
              width: "22.95%",
              height: "auto",
            }}
          />

          {/* Visa Network Branding Bubble */}
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: "20.6%",
              height: "60.64%",
              backgroundColor: "#303030",
              borderRadius: "calc(var(--cw) * 0.025)",
            }}
          >
            <img 
              src="/card-svg/Visa%20SVG.svg" 
              alt="Visa"
              draggable={false}
              className="pointer-events-none select-none"
              style={{
                width: "75.48%",
                height: "auto",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
