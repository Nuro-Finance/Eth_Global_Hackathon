"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Symmetric space on both sides of the copy control in address rows. */
export const ADDRESS_ROW_COPY_SIDE_PAD_PX = 12;
export const ADDRESS_ROW_COPY_BTN_PX = 32;
const ADDRESS_ROW_FONT_MIN_PX = 9;
const ADDRESS_ROW_FONT_MAX_PX = 18;

export type FitMonospaceAddressRowOptions = {
  fontMinPx?: number;
  fontMaxPx?: number;
};

export function useFitMonospaceAddressRow(
  displayText: string,
  options?: FitMonospaceAddressRowOptions,
) {
  const fontMinPx = options?.fontMinPx ?? ADDRESS_ROW_FONT_MIN_PX;
  const fontMaxPx = options?.fontMaxPx ?? ADDRESS_ROW_FONT_MAX_PX;

  const addressRowRef = useRef<HTMLDivElement>(null);
  const addressTextCellRef = useRef<HTMLDivElement>(null);
  const addressTextRef = useRef<HTMLSpanElement>(null);
  const [addressFontPx, setAddressFontPx] = useState(fontMaxPx);

  const fitAddressFont = useCallback(() => {
    const cell = addressTextCellRef.current;
    const text = addressTextRef.current;
    if (!cell || !text) return;

    const targetWidth = cell.getBoundingClientRect().width;
    if (targetWidth <= 0) return;

    let lo = fontMinPx;
    let hi = fontMaxPx;
    let best = lo;

    while (hi - lo > 0.05) {
      const mid = (lo + hi) / 2;
      text.style.fontSize = `${mid}px`;
      const width = text.getBoundingClientRect().width;
      if (width <= targetWidth) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    text.style.fontSize = `${best}px`;
    setAddressFontPx(best);
  }, [fontMinPx, fontMaxPx]);

  useLayoutEffect(() => {
    let cancelled = false;
    const runFit = () => {
      if (!cancelled) fitAddressFont();
    };

    runFit();
    const raf = requestAnimationFrame(() => requestAnimationFrame(runFit));
    const fontsReady = document.fonts?.ready;
    if (fontsReady) void fontsReady.then(runFit);

    const observeEl =
      addressTextCellRef.current ?? addressRowRef.current;
    if (!observeEl) {
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    const ro = new ResizeObserver(runFit);
    ro.observe(observeEl);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [displayText, fitAddressFont, fontMinPx, fontMaxPx]);

  return {
    addressRowRef,
    addressTextCellRef,
    addressTextRef,
    addressFontPx,
    addressRowGridStyle: {
      gridTemplateColumns: `minmax(0, 1fr) ${ADDRESS_ROW_COPY_BTN_PX}px`,
      columnGap: ADDRESS_ROW_COPY_SIDE_PAD_PX,
    } as const,
  };
}
