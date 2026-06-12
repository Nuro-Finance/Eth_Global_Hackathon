"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useNotifications, useClickOutside } from "./hooks";
import {
  NotificationTrigger,
  NotificationHeader,
  NotificationList,
  NotificationsModal,
} from "./components";
import { useHeaderMenu } from "@/layouts/Header/HeaderMenuContext";
import { HEADER_DROPDOWN_SIDE_OFFSET_PX } from "@/components/ui/dropdown-menu";
import {
  COMPACT_GLASS_SHELL_INNER_CLASS,
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
} from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";

const notificationPanelClassName = cn(
  "z-[100] flex flex-col w-[20rem] sm:w-[22.5rem] max-w-[calc(100vw-2rem)]",
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  "!backdrop-blur-[var(--glass-blur-modal)] backdrop-saturate-[1.35]",
);

const notificationDropdownInnerStyle = {
  ...COMPACT_GLASS_SHELL_INNER_STYLE,
  backgroundColor: "rgba(255, 255, 255, 0.03)",
};

/**
 * Notifications dropdown with modular components
 */
export function NotificationsDropdown() {
  const t = useTranslations("Dashboard");
  const headerMenu = useHeaderMenu();

  const [localOpen, setLocalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const isOpen = headerMenu
    ? headerMenu.openMenuId === "notifications"
    : localOpen;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const { notifications, unreadCount, markAsRead, removeNotification } =
    useNotifications();

  const closeDropdown = useCallback(() => {
    if (headerMenu) headerMenu.closeMenu();
    else setLocalOpen(false);
  }, [headerMenu]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const fallbackWidth = window.matchMedia("(min-width: 640px)").matches ? 360 : 320;
    const panelWidth = panel?.getBoundingClientRect().width || fallbackWidth;
    const viewportPad = 8;
    const top = triggerRect.bottom + HEADER_DROPDOWN_SIDE_OFFSET_PX;
    const left = triggerRect.right - panelWidth;
    const clampedLeft = Math.min(
      Math.max(viewportPad, left),
      window.innerWidth - panelWidth - viewportPad,
    );

    setCoords({ top, left: clampedLeft });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const sync = () => updatePosition();
    sync();
    const raf = requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const panel = panelRef.current;
    const ro =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(sync)
        : null;
    ro?.observe(panel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      ro?.disconnect();
    };
  }, [isOpen, updatePosition]);

  const outsideClickRefs = useMemo(
    () => [containerRef, panelRef] as RefObject<HTMLElement | null>[],
    []
  );

  useClickOutside(outsideClickRefs, isOpen, closeDropdown);

  const handleSeeAll = useCallback(() => {
    closeDropdown();
    setModalOpen(true);
  }, [closeDropdown]);

  const handleToggle = () => {
    if (headerMenu) {
      if (headerMenu.openMenuId === "notifications") {
        headerMenu.closeMenu();
      } else {
        updatePosition();
        headerMenu.openMenu("notifications");
      }
    } else {
      setLocalOpen((prev) => !prev);
    }
  };

  const panel =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className={notificationPanelClassName}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              ...COMPACT_GLASS_SHELL_OUTER_STYLE,
            }}
            role="dialog"
            aria-label={t("notifications")}
          >
            <div
              className={COMPACT_GLASS_SHELL_INNER_CLASS}
              style={notificationDropdownInnerStyle}
            >
              <NotificationHeader
                title={t("notifications")}
                seeAllLabel="More"
                onSeeAll={handleSeeAll}
                showSeeAll={notifications.length > 0}
              />

              <div className="px-4 pb-2">
                <NotificationList
                  notifications={notifications}
                  scrollAfter={5}
                  onMarkAsRead={markAsRead}
                  onRemove={removeNotification}
                  emptyMessage={t("noNotifications") || "No notifications"}
                  markAsReadLabel={t("markAsRead") || "Mark as read"}
                  removeLabel={t("remove") || "Remove"}
                />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <NotificationTrigger
        ref={triggerRef}
        unreadCount={unreadCount}
        onClick={handleToggle}
        ariaLabel={t("notifications")}
      />
      {panel}
      <NotificationsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={t("notifications")}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onRemove={removeNotification}
        emptyMessage={t("noNotifications") || "No notifications"}
        markAsReadLabel={t("markAsRead") || "Mark as read"}
        removeLabel={t("remove") || "Remove"}
      />
    </div>
  );
}

export default NotificationsDropdown;
