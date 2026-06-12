"use client";

import * as React from "react";

/** Same base slate as the fixed viewport layer — use inside chat “plates” with a mask (never mask the scroller). */
export const globalBackgroundMirroredClassName =
  "pointer-events-none bg-[var(--color-bg-primary)]";

/**
 * GlobalBackground - Performance Optimized
 * Uses a single noise layer with minimal complexity to prevent paint hangs.
 */
export const GlobalBackground = ({ zIndex = "-z-50" }: { zIndex?: string }) => {
  return (
    <>
      {/* 1. Base Slate - Solid and cheap */}
      <div className={cn("fixed inset-0", globalBackgroundMirroredClassName, zIndex)} />
      
      {/* 2. Texture Grain - Removed as requested */}
    </>
  );
};

// Helper for class merging without external dependency
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
