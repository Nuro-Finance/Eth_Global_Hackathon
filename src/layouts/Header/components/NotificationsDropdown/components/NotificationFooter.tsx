"use client";

import { IconSettings } from "@tabler/icons-react";
import { Button } from "@/components/ui";

interface NotificationFooterProps {
  settingsLabel: string;
  onSettingsClick: () => void;
}

/**
 * Footer section with settings button
 */
export function NotificationFooter({
  settingsLabel,
  onSettingsClick,
}: NotificationFooterProps) {
  return (
    <div className="p-3 sm:p-4 border-t border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] bg-transparent">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] text-xs sm:text-sm"
        onClick={onSettingsClick}
      >
        <IconSettings
          className="w-3 h-3 sm:w-4 sm:h-4 me-1 sm:me-2"
          stroke={1.5}
        />
        {settingsLabel}
      </Button>
    </div>
  );
}
