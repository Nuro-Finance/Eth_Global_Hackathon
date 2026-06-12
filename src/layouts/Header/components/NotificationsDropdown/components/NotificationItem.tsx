"use client";

import { IconCheck, IconX } from "@tabler/icons-react";
import type { Notification } from "../types";
import { getTypeColor } from "../config";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
  markAsReadLabel: string;
  removeLabel: string;
}

/**
 * Individual notification: title + short time + actions on one row; message below.
 */
export function NotificationItem({
  notification,
  onMarkAsRead,
  onRemove,
  markAsReadLabel,
  removeLabel,
}: NotificationItemProps) {
  return (
    <div className="group rounded-[20px] pl-3 pr-[17px] py-2 transition-colors bg-transparent hover:bg-white/2 dark:hover:bg-white/2 outline-none focus-visible:bg-white/2 dark:focus-visible:bg-white/2">
      <div className="flex gap-2.5 sm:gap-3 items-start">
        <div
          className={`w-2 h-2 rounded-full mt-[7px] sm:mt-2 flex-shrink-0 ${getTypeColor(
            notification.type
          )}`}
          aria-hidden
        />

        <div className="flex-1 min-w-0 flex flex-col gap-1 sm:gap-1.5">
          {/* Top line: title + time + actions (actions aligned to cap height) */}
          <div className="relative flex items-start justify-between gap-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap">
              <h4 className="truncate font-medium text-[var(--color-text-primary)] text-xs sm:text-sm leading-snug">
                {notification.title}
              </h4>
              <span
                className="shrink-0 text-[var(--color-text-muted)] text-[11px] sm:text-xs font-medium tabular-nums"
                title={notification.time}
              >
                {notification.timeShort}
              </span>
            </div>

            <div className="absolute right-0 top-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onMarkAsRead(notification.id)}
                  className="p-1 rounded-[6px] bg-transparent text-[var(--color-text-muted)] hover:bg-white/2 dark:hover:bg-white/2 hover:text-[var(--color-text-primary)] transition-colors outline-none"
                  title={markAsReadLabel}
                >
                  <IconCheck className="w-3.5 h-3.5" stroke={2} />
                </button>
              <button
                type="button"
                onClick={() => onRemove(notification.id)}
                className="p-1 rounded-[6px] bg-transparent text-[var(--color-text-muted)] hover:bg-white/2 dark:hover:bg-white/2 hover:text-[var(--color-error)] transition-colors outline-none"
                title={removeLabel}
              >
                <IconX className="w-3.5 h-3.5" stroke={2} />
              </button>
            </div>
          </div>

          <p className="text-[var(--color-text-muted)] text-xs sm:text-sm leading-relaxed pr-1">
            {notification.message}
          </p>
        </div>
      </div>
    </div>
  );
}
