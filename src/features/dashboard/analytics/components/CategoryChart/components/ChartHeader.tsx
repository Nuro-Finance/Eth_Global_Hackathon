"use client";

import { IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface ChartHeaderProps {
  title: string;
  onDownload: () => void;
}

/**
 * Reusable chart header with title and download button
 */
export function ChartHeader({ title, onDownload }: ChartHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4 xl:mb-6">
      <h3 className="text-[var(--color-text-secondary)] text-[16px] xl:text-[18px] font-normal">
        {title}
      </h3>

      <Button
        variant="ghost"
        size="icon"
        onClick={onDownload}
        title="Download chart as PNG"
        className="bg-[var(--color-bg-hover)]/50 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] h-8 w-8 xl:h-9 xl:w-9"
      >
        <IconDownload className="h-4 w-4" />
      </Button>
    </div>
  );
}
