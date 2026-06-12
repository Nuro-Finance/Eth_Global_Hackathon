"use client";

import { forwardRef } from "react";
import { IconBell } from "@tabler/icons-react";
import { IconButton, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

interface NotificationTriggerProps {
  unreadCount: number;
  onClick: () => void;
  ariaLabel: string;
}

/**
 * Notification bell trigger button with badge
 */
export const NotificationTrigger = forwardRef<
  HTMLButtonElement,
  NotificationTriggerProps
>(function NotificationTrigger(
  { unreadCount, onClick, ariaLabel },
  ref
) {
  return (
    <IconButton
      ref={ref}
      variant="canvas"
      onClick={onClick}
      className="relative"
      aria-label={ariaLabel}
      icon={
        <>
          <IconBell
            className="w-5 h-5 text-[var(--color-text-primary)]"
            stroke={1.5}
          />

          {unreadCount > 0 && (
            <Badge
              variant="error"
              size="sm"
              className={cn(
                "absolute top-0 -end-1.5 min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-medium",
 /* Match freeze / card coral (var(--color-error)); default error badge uses var(--color-error-light) */
                "border-[var(--color-error)]/60 bg-[var(--color-error)]/22 text-[var(--color-error)] hover:bg-[var(--color-error)]/30"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </>
      }
    />
  );
});
