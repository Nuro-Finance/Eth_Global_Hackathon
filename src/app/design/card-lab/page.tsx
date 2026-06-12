"use client";

import React, { useState, useRef, useEffect } from "react";
import { Eye, EyeOff, ShieldCheck, Code, Sliders, Layers, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

import { NuroCodeCard } from "@/components/NuroCodeCard";

// --- Main Page Component ---
export default function CardLabPage() {
  const [balance, setBalance] = useState(2800.88);
  const [cardHolder, setCardHolder] = useState("CHRIS BRIGNOLA");
  const [pan, setPan] = useState("•••• •••• •••• 1234");
  const [expiry, setExpiry] = useState("08/29");
  const [cvv, setCvv] = useState("321");
  const [revealed, setRevealed] = useState(false);
  const [cardName, setCardName] = useState("Anthropic API");
  const [cardWidth, setCardWidth] = useState(600);
  const [cardHeight, setCardHeight] = useState(368);
  const [widthDraft, setWidthDraft] = useState("600");
  const [heightDraft, setHeightDraft] = useState("368");
  const [copied, setCopied] = useState(false);

  // Styling customizations
  const [gradientStart, setGradientStart] = useState("#1a1a1c");
  const [gradientEnd, setGradientEnd] = useState("#0b0b0d");

  // Draggable resizing state
  const isDragging = useRef<"width" | "height" | "both" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const startWidth = useRef(600);
  const startHeight = useRef(368);

  const handlePointerDown = (e: React.PointerEvent, mode: "width" | "height" | "both") => {
    isDragging.current = mode;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startWidth.current = cardWidth;
    startHeight.current = cardHeight;
    
    if (mode === "width") document.body.style.cursor = "ew-resize";
    else if (mode === "height") document.body.style.cursor = "ns-resize";
    else document.body.style.cursor = "se-resize";
    
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - startX.current;
      const deltaY = e.clientY - startY.current;
      
      if (isDragging.current === "width" || isDragging.current === "both") {
        setCardWidth(Math.min(3000, Math.max(280, startWidth.current + deltaX)));
      }
      if (isDragging.current === "height" || isDragging.current === "both") {
        setCardHeight(Math.min(2000, Math.max(160, startHeight.current + deltaY)));
      }
    };

    const handlePointerUp = () => {
      if (isDragging.current) {
        isDragging.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [cardWidth, cardHeight]);

  const copyCode = () => {
    navigator.clipboard.writeText(CARD_CODE_STRING);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header bar */}
      <header className="border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-md px-8 py-5 sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="h-6 w-6 rounded bg-[#2775CA] flex items-center justify-center text-xs font-black text-white">N</span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white">Nuro Card Laboratory</h1>
              <p className="text-[11px] text-[#71717a] font-medium">Responsive CSS-based Debit Card Playground</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="/en/dashboard" 
              className="text-xs font-medium text-white/60 hover:text-white transition-colors bg-white/[0.04] px-3.5 py-1.5 rounded-lg border border-white/[0.05]"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Interactive Playground (8 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full">
          {/* Section: Sandbox frame */}
          <div className="border border-white/[0.06] bg-[#0f0f11] rounded-2xl p-8 flex flex-col gap-4 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Dynamic Strecth & Resizing
              </span>
              <span className="text-[11px] font-mono text-[#71717a]">
                Width: {Math.round(cardWidth)}px | Height: {Math.round(cardHeight)}px | Aspect: {(cardWidth / cardHeight).toFixed(3)}
              </span>
            </div>

            {/* Sandbox Container Area */}
            <div className="bg-[#09090a] border border-white/[0.04] rounded-xl min-h-[420px] p-12 flex items-center justify-center relative overflow-auto">
              {/* Outer Wrapper for Sizing Card */}
              <div 
                style={{ width: `${cardWidth}px`, height: `${cardHeight}px` }} 
                className="relative shrink-0"
              >
                {/* Card itself - isolated from group to prevent repaint jitter */}
                <div className="absolute inset-0 will-change-auto">
                  <NuroCodeCard
                    balance={balance}
                    cardHolderName={cardHolder}
                    cardName={cardName}
                    panMasked={pan}
                    expiry={expiry}
                    cvv={cvv}
                    sensitiveRevealed={revealed}
                    onToggleSensitive={() => setRevealed(!revealed)}
                    gradientStart={gradientStart}
                    gradientEnd={gradientEnd}
                  />
                </div>

                {/* Resize handles overlay - group scoped here only */}
                <div className="absolute inset-0 group pointer-events-none">
                  {/* Right side resize handle */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, "width")}
                    className="absolute -right-3 top-[10%] bottom-[10%] w-6 cursor-ew-resize flex items-center justify-center select-none opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
                    title="Drag to resize width"
                  >
                    <div className="w-1 h-16 rounded-full bg-white/20 border border-white/10" />
                  </div>

                  {/* Bottom resize handle */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, "height")}
                    className="absolute -bottom-3 left-[10%] right-[10%] h-6 cursor-ns-resize flex items-center justify-center select-none opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
                    title="Drag to resize height"
                  >
                    <div className="h-1 w-16 rounded-full bg-white/20 border border-white/10" />
                  </div>

                  {/* Corner (2D) resize handle */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, "both")}
                    className="absolute -bottom-2 -right-2 w-5 h-5 cursor-se-resize flex items-center justify-center select-none opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-50"
                    title="Drag corner to resize both dimensions"
                  >
                    <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-white/40" />
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Resizers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#71717a] font-bold uppercase tracking-wider">Card Width</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="280"
                    max="3000"
                    value={Math.round(cardWidth)}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      setCardWidth(v);
                      setWidthDraft(String(v));
                    }}
                    className="flex-1 accent-white h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={widthDraft}
                    onChange={(e) => setWidthDraft(e.target.value)}
                    onBlur={() => {
                      const v = Math.round(Number(widthDraft));
                      const clamped = isNaN(v) ? cardWidth : Math.min(3000, Math.max(280, v));
                      setCardWidth(clamped);
                      setWidthDraft(String(clamped));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-[72px] bg-[#09090a] border border-white/[0.08] rounded-md px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#71717a] font-bold uppercase tracking-wider">Card Height</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="160"
                    max="2000"
                    value={Math.round(cardHeight)}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      setCardHeight(v);
                      setHeightDraft(String(v));
                    }}
                    className="flex-1 accent-white h-1 bg-white/10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={heightDraft}
                    onChange={(e) => setHeightDraft(e.target.value)}
                    onBlur={() => {
                      const v = Math.round(Number(heightDraft));
                      const clamped = isNaN(v) ? cardHeight : Math.min(2000, Math.max(160, v));
                      setCardHeight(clamped);
                      setHeightDraft(String(clamped));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-[72px] bg-[#09090a] border border-white/[0.08] rounded-md px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#71717a]">Presets:</span>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { name: "Debit Card (1.58)", w: 480, h: 302 },
                  { name: "Wide Screen (2.0)", w: 600, h: 300 },
                  { name: "Narrow (1.2)", w: 360, h: 300 },
                  { name: "Square (1.0)", w: 320, h: 320 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setCardWidth(preset.w);
                      setCardHeight(preset.h);
                    }}
                    className="text-[10px] bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-white px-2.5 py-1 rounded-md"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Component explanation */}
          <div className="border border-white/[0.06] bg-[#0f0f11] rounded-2xl p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Aspect-Ratio Independent Scaling
            </h2>
            <div className="text-xs leading-relaxed text-[#a1a1aa] space-y-2">
              <p>
                To handle variable sizes and grid layout shifts without breaking or overflowing:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  We replaced the fixed aspect ratio locks with absolute flex sizing (`w-full h-full`), letting the card expand to fill its grid boundaries naturally.
                </li>
                <li>
                  We replaced the width-only container query units (`cqw`) with **`cqmin`** units. `1cqmin` matches 1% of the **smaller** card dimension (width or height).
                </li>
                <li>
                  This makes font sizing responsive to height constraints as well. If the card becomes very short (wide aspect ratio), details shrink proportionally so they never bleed out of the card margins.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Side: Control Dashboard (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6 w-full">
          {/* Section: Controls card */}
          <div className="border border-white/[0.06] bg-[#0f0f11] rounded-2xl p-6 flex flex-col gap-5">
            <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Customize Details
            </h2>

            {/* Form inputs */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">Card Balance</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#71717a] font-semibold">$</span>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(Number(e.target.value))}
                    className="w-full bg-[#09090a] border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">Cardholder Name</label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full bg-[#09090a] border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                />
              </div>

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-6 flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">Expiry</label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full bg-[#09090a] border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 font-mono"
                  />
                </div>
                <div className="col-span-6 flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">CVV</label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    className="w-full bg-[#09090a] border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">Card Number</label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  className="w-full bg-[#09090a] border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 font-mono"
                />
              </div>

              {/* Theme customizers */}
              <div className="border-t border-white/[0.04] pt-4 mt-1 flex flex-col gap-3">
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#71717a]">Card Texture Gradient</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[#71717a]">Gradient Start</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={gradientStart}
                        onChange={(e) => setGradientStart(e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer overflow-hidden p-0"
                      />
                      <span className="text-[10px] font-mono text-[#a1a1aa]">{gradientStart}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[#71717a]">Gradient End</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={gradientEnd}
                        onChange={(e) => setGradientEnd(e.target.value)}
                        className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer overflow-hidden p-0"
                      />
                      <span className="text-[10px] font-mono text-[#a1a1aa]">{gradientEnd}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Code view */}
          <div className="border border-white/[0.06] bg-[#0f0f11] rounded-2xl p-6 flex flex-col gap-3 relative">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" /> Component Code
              </h2>
              <button
                type="button"
                onClick={copyCode}
                className="text-[10px] font-semibold text-white/60 hover:text-white flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.04] rounded px-2.5 py-1 transition-all"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy Code
                  </>
                )}
              </button>
            </div>
            <div className="relative bg-[#050506] border border-white/[0.04] rounded-lg max-h-[220px] overflow-y-auto p-4 scrollbar-autohide">
              <pre className="text-[10px] font-mono text-[#a1a1aa] leading-relaxed whitespace-pre">
                {CARD_CODE_STRING}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const CARD_CODE_STRING = `type NuroCodeCardProps = {
  balance: number;
  panMasked: string;
  expiry: string;
  cvv: string;
  sensitiveRevealed: boolean;
  onToggleSensitive?: () => void;
  cardHolderName?: string;
  gradientStart?: string;
  gradientEnd?: string;
};

export function NuroCodeCard({
  balance,
  panMasked,
  expiry,
  cvv,
  sensitiveRevealed,
  onToggleSensitive,
  cardHolderName = "CHRIS BRIGNOLA",
  gradientStart = "#18181b",
  gradientEnd = "#09090b",
}: NuroCodeCardProps) {
  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(balance);

  return (
    <div className="@container w-full h-full">
      <div 
        className="relative w-full h-full rounded-[6cqmin] p-[6.5cqmin] flex flex-col justify-between overflow-hidden shadow-2xl border border-white/[0.06]"
        style={{
          background: \`linear-gradient(135deg, \${gradientStart} 0%, \${gradientEnd} 100%)\`,
        }}
      >
        {/* Vector Background Lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.22] z-0 select-none">
          <svg className="w-full h-full object-cover scale-[1.05]" viewBox="0 0 320 200" fill="none">
            <path d="M-40 160 C 40 130, 80 190, 160 140 C 220 100, 260 210, 360 170" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
            <path d="M-40 140 C 40 110, 80 170, 160 120 C 220 80, 260 190, 360 150" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
            <path d="M-40 120 C 40 90, 80 150, 160 100 C 220 60, 260 170, 360 130" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          </svg>
        </div>

        {/* Top Header */}
        <div className="relative z-10 flex justify-between items-start w-full">
          <span className="font-semibold text-white tracking-tight text-[8.8cqmin] leading-none tabular-nums">
            {formattedBalance}
          </span>
          <span className="font-bold text-white/95 tracking-[0.05em] text-[6.8cqmin] uppercase font-mono">
            nuro
          </span>
        </div>

        {/* Card Details */}
        <div className="relative z-10 flex justify-between items-end w-full">
          <div className="flex flex-col gap-[1.5cqmin] text-left min-w-0 flex-1 pr-[4cqmin]">
            <p className="truncate font-semibold tracking-[0.05em] text-white/85 text-[3.8cqmin] uppercase leading-tight">
              {cardHolderName}
            </p>
            <div className="flex gap-[3.5cqmin] text-[3.2cqmin] font-medium leading-none">
              <span className="text-white/45">Expires <strong className="text-white/80 ml-[0.5cqmin]">{sensitiveRevealed ? expiry : "••/••"}</strong></span>
              <span className="text-white/45">CVV <strong className="text-white/80 ml-[0.5cqmin]">{sensitiveRevealed ? cvv : "•••"}</strong></span>
            </div>
            <div className="flex items-center gap-[2.5cqmin] mt-[0.5cqmin]">
              <span className="text-[4.4cqmin] font-semibold tracking-[0.08em] font-mono leading-none text-white">
                {sensitiveRevealed ? panMasked : "•••• •••• •••• " + panMasked.slice(-4)}
              </span>
              {onToggleSensitive && (
                <button type="button" onClick={onToggleSensitive} className="p-[1cqmin] rounded-md text-white/45 hover:text-white">
                  {sensitiveRevealed ? <EyeOff className="w-[4.4cqmin] h-[4.4cqmin]" /> : <Eye className="w-[4.4cqmin] h-[4.4cqmin]" />}
                </button>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <span className="font-black italic text-[6.2cqmin] tracking-tighter text-white opacity-85">VISA</span>
          </div>
        </div>
      </div>
    </div>
  );
}`;
