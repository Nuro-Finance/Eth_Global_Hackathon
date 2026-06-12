"use client";
import { useState, useEffect, useCallback } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import type { Notification } from "../types";
import { DESIGN_MODE } from "@/config/design-mode";
import { MOCK_NOTIFICATIONS } from "@/config/mock-data";
import { subscribeDashboardInFlightOperation } from "@/lib/dashboardInFlightOperation";

const LOCAL_IN_FLIGHT_ID_PREFIX = "local-in-flight-";

/**
 * useNotifications — fetches real notifications from backend via proxy
 * GET /api/notifications → Express → PostgreSQL
 */
export function useNotifications() {
  const { data: session } = useAppSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const token = (session as any)?.accessToken;

  const mapApiNotifications = useCallback((rows: any[]): Notification[] => {
    return rows.map((n: any) => ({
      id: n.id,
      title: n.title || n.type || "Notification",
      message: n.message || n.body || "",
      time: formatRelativeTime(n.created_at || n.createdAt),
      timeShort: formatShortTime(n.created_at || n.createdAt),
      isRead: n.is_read ?? n.isRead ?? false,
      type: mapNotificationType(n.type),
    }));
  }, []);

  const refetchNotifications = useCallback(() => {
    if (DESIGN_MODE || !token) return;
    fetch("/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        const rows = Array.isArray(data) ? data : [];
        setNotifications((prev) => {
          const inFlight = prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX));
          return [...inFlight, ...mapApiNotifications(rows)];
        });
      })
      .catch((err) => console.error("[useNotifications] refetch failed:", err));
  }, [token, mapApiNotifications]);

  // Fetch notifications on mount
  useEffect(() => {
    if (DESIGN_MODE) {
      setNotifications(
        MOCK_NOTIFICATIONS.map((n) => ({
          id: n.id,
          title: n.title || n.type || "Notification",
          message: n.message || n.body || "",
          time: formatRelativeTime(n.created_at || n.createdAt),
          timeShort: formatShortTime(n.created_at || n.createdAt),
          isRead: n.is_read ?? n.isRead ?? false,
          type: mapNotificationType(n.type),
        }))
      );
      setIsLoading(false);
      return;
    }

    if (!token) { setIsLoading(false); return; }
    fetch("/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        const rows = Array.isArray(data) ? data : [];
        setNotifications((prev) => {
          const inFlight = prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX));
          return [...inFlight, ...mapApiNotifications(rows)];
        });
      })
      .catch((err) => {
        console.error("[useNotifications] fetch failed:", err);
        setNotifications((prev) => prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX)));
      })
      .finally(() => setIsLoading(false));
  }, [token, mapApiNotifications]);

  // In-flight signal: header pill decays after 10s; bell entry stays until read/dismiss or server refetch replaces it.
  useEffect(() => {
    const unsub = subscribeDashboardInFlightOperation((kind) => {
      const kindPrefix = `${LOCAL_IN_FLIGHT_ID_PREFIX}${kind}-`;
      const id = `${kindPrefix}${Date.now()}`;
      const title = kind === "reload" ? "Reload in progress" : "Withdraw in progress";
      const message =
        kind === "reload"
          ? "Your reload is being verified and will credit when complete."
          : "Your withdrawal is being processed.";
      const now = new Date().toISOString();
      const item: Notification = {
        id,
        title,
        message,
        time: formatRelativeTime(now),
        timeShort: formatShortTime(now),
        isRead: false,
        type: "info",
      };
      setNotifications((prev) => [item, ...prev.filter((n) => !n.id.startsWith(kindPrefix))]);
      void refetchNotifications();
    });
    return unsub;
  }, [refetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = useCallback(
    async (id: string) => {
      // Mark as read AND remove from view
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX)) return;
      if (DESIGN_MODE) return;
      if (token) {
        fetch(`/api/notifications/${id}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(console.error);
      }
    },
    [token]
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (DESIGN_MODE) return;
    if (token) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error);
    }
  }, [token]);

  const removeNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX)) return;
    if (DESIGN_MODE) return;
    if (token) {
      fetch(`/api/notifications/${id}/dismiss`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error);
    }
  }, [token]);

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, removeNotification };
  
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "recently";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function formatShortTime(dateStr: string): string {
  if (!dateStr) return "now";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function mapNotificationType(type: string): "success" | "warning" | "info" | "error" {
  switch (type?.toLowerCase()) {
    case "transaction": return "success";
    case "alert": case "security": return "warning";
    case "error": return "error";
    default: return "info";
  }
}
