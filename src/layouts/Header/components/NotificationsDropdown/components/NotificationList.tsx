"use client";

import type { Notification } from "../types";
import { NotificationItem } from "./NotificationItem";

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
  emptyMessage: string;
  markAsReadLabel: string;
  removeLabel: string;
 /** @deprecated Prefer scrollAfter for dropdown — caps list length. */
  maxVisible?: number;
 /** Dropdown: fit this many rows, then scroll (shows all notifications). */
  scrollAfter?: number;
}

/**
 * Notification rows; dropdown uses scrollAfter to fit N rows then scroll.
 */
export function NotificationList({
  notifications,
  onMarkAsRead,
  onRemove,
  emptyMessage,
  markAsReadLabel,
  removeLabel,
  maxVisible,
  scrollAfter,
}: NotificationListProps) {
  const visible =
    scrollAfter !== undefined
      ? notifications
      : maxVisible !== undefined
        ? notifications.slice(0, maxVisible)
        : notifications;

  const needsScroll =
    scrollAfter !== undefined && visible.length > scrollAfter;
  const scrollMaxHeight =
    scrollAfter !== undefined
      ? `calc(${scrollAfter} * 4.75rem)`
      : undefined;

  if (visible.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">
        {emptyMessage}
      </div>
    );
  }

  const list = (
    <div className="flex flex-col">
      {visible.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
          onRemove={onRemove}
          markAsReadLabel={markAsReadLabel}
          removeLabel={removeLabel}
        />
      ))}
    </div>
  );

  if (!needsScroll) return list;

  return (
    <div
      className="overflow-y-auto overscroll-contain scrollbar-hide"
      style={{ maxHeight: scrollMaxHeight }}
    >
      {list}
    </div>
  );
}
