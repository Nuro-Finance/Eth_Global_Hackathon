"use client";

import { memo } from "react";
import { IconPlus, IconMinus } from "@tabler/icons-react";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const ZoomControls = memo<ZoomControlsProps>(function ZoomControls({
  onZoomIn,
  onZoomOut,
}) {
  return (
    <div className="absolute top-2 end-2 z-10 flex gap-1.5">
      <button
        onClick={onZoomIn}
        className="w-7 h-7 sm:w-8 sm:h-8 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] rounded-lg flex items-center justify-center hover:bg-[var(--color-bg-hover)] transition-colors"
        aria-label="Zoom in"
        type="button"
      >
        <IconPlus
          size={16}
          className="text-[var(--color-text-primary)]"
          stroke={2}
        />
      </button>
      <button
        onClick={onZoomOut}
        className="w-7 h-7 sm:w-8 sm:h-8 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] rounded-lg flex items-center justify-center hover:bg-[var(--color-bg-hover)] transition-colors"
        aria-label="Zoom out"
        type="button"
      >
        <IconMinus
          size={16}
          className="text-[var(--color-text-primary)]"
          stroke={2}
        />
      </button>
    </div>
  );
});

export default ZoomControls;
