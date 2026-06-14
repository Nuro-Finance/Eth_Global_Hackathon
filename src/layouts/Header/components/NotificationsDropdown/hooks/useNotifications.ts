"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAppSession } from "@/hooks/useAppSession";
import { useSessionDisplayIdentity } from "@/hooks/useSessionDisplayIdentity";
import { useDemoDevSession } from "@/hooks/useDemoDevSession";
import { usePrivyWalletAddress } from "@/hooks/usePrivyWalletAddress";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import type { Notification } from "../types";
import { DESIGN_MODE } from "@/config/design-mode";
import { MOCK_NOTIFICATIONS } from "@/config/mock-data";
import { subscribeDashboardInFlightOperation } from "@/lib/dashboardInFlightOperation";
import { readOnboardingProgress } from "@/lib/account-onboarding-progress";
import { getWelcomeUserId } from "@/lib/welcome-onboarding";
import { resolveDisplayFirstName } from "@/lib/displayName";
import {
  buildNewAccountNotifications,
  isAccountSetupIncomplete,
  isSetupNotificationId,
  mapKycStatusFromApi,
  persistDismissedSetupNotificationId,
  readDismissedSetupNotificationIds,
} from "@/lib/new-account-notifications";

const LOCAL_IN_FLIGHT_ID_PREFIX = "local-in-flight-";

/**
 * useNotifications - fetches real notifications from backend via proxy
 * GET /api/notifications → Express → PostgreSQL
 */
export function useNotifications() {
  const t = useTranslations("Dashboard");
  const { data: session } = useAppSession();
  const { name: displayIdentityName, email } = useSessionDisplayIdentity();
  const isDemoDev = useDemoDevSession();
  const { isDevAvailable, populated: devPopulatedPreview } = useDevPreviewMode();
  const { hasWallet } = usePrivyWalletAddress();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [kycVerified, setKycVerified] = useState(false);
  const [kycLoaded, setKycLoaded] = useState(false);
  const [onboardingTick, setOnboardingTick] = useState(0);
  const [dismissedTick, setDismissedTick] = useState(0);

  const token = (session as { accessToken?: string } | null)?.accessToken;
  const sessionUser = session?.user as { id?: string; email?: string | null; name?: string } | undefined;
  const userId = getWelcomeUserId(sessionUser);

  const displayName = resolveDisplayFirstName({
    name: displayIdentityName ?? sessionUser?.name,
    email: email ?? sessionUser?.email,
  });

  const onboardingState = useMemo(() => {
    void onboardingTick;
    return readOnboardingProgress(userId);
  }, [userId, onboardingTick]);

  const dismissedIds = useMemo(() => {
    void dismissedTick;
    return readDismissedSetupNotificationIds(userId);
  }, [userId, dismissedTick]);

  const usePopulatedDemoNotifications =
    DESIGN_MODE && isDevAvailable && isDemoDev && devPopulatedPreview;

  const accountSetupIncomplete = isAccountSetupIncomplete({
    onboardingState,
    hasWallet,
    kycVerified,
  });

  const useSetupNotifications =
    !usePopulatedDemoNotifications &&
    (DESIGN_MODE ? isDevAvailable && !devPopulatedPreview : accountSetupIncomplete);

  const setupLabels = useMemo(
    () => ({
      welcomeTitle: t("notificationWelcomeTitle"),
      welcomeMessage: (name: string) => t("notificationWelcomeMessage", { name }),
      finishSetupTitle: t("notificationFinishSetupTitle"),
      finishSetupMessage: t("notificationFinishSetupMessage"),
      connectWalletTitle: t("notificationConnectWalletTitle"),
      connectWalletMessage: t("notificationConnectWalletMessage"),
      verifyIdentityTitle: t("notificationVerifyIdentityTitle"),
      verifyIdentityMessage: t("notificationVerifyIdentityMessage"),
    }),
    [t],
  );

  const setupNotifications = useMemo(
    () =>
      buildNewAccountNotifications(
        {
          displayName,
          onboardingState,
          hasWallet,
          kycVerified,
          dismissedIds,
        },
        setupLabels,
      ),
    [displayName, onboardingState, hasWallet, kycVerified, dismissedIds, setupLabels],
  );

  const mapApiNotifications = useCallback((rows: unknown[]): Notification[] => {
    return rows.map((row) => {
      const n = row as Record<string, unknown>;
      const createdAt = String(n.created_at ?? n.createdAt ?? "");
      return {
        id: String(n.id),
        title: String(n.title || n.type || "Notification"),
        message: String(n.message || n.body || ""),
        time: formatRelativeTime(createdAt),
        timeShort: formatShortTime(createdAt),
        isRead: Boolean(n.is_read ?? n.isRead ?? false),
        type: mapNotificationType(String(n.type ?? "")),
      };
    });
  }, []);

  const refetchNotifications = useCallback(() => {
    if (DESIGN_MODE || !token || useSetupNotifications) return;
    fetch("/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown[]) => {
        const rows = Array.isArray(data) ? data : [];
        setNotifications((prev) => {
          const inFlight = prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX));
          return [...inFlight, ...mapApiNotifications(rows)];
        });
      })
      .catch((err) => console.error("[useNotifications] refetch failed:", err));
  }, [token, mapApiNotifications, useSetupNotifications]);

  useEffect(() => {
    const onProgressChanged = () => setOnboardingTick((n) => n + 1);
    window.addEventListener("nuro:onboarding-progress-changed", onProgressChanged);
    return () => window.removeEventListener("nuro:onboarding-progress-changed", onProgressChanged);
  }, []);

  useEffect(() => {
    if (DESIGN_MODE) {
      setKycVerified(false);
      setKycLoaded(true);
      return;
    }
    if (!token) {
      setKycVerified(false);
      setKycLoaded(true);
      return;
    }
    setKycLoaded(false);
    fetch("/api/kyc/status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { status?: string }) => {
        setKycVerified(mapKycStatusFromApi(data.status));
      })
      .catch(() => setKycVerified(false))
      .finally(() => setKycLoaded(true));
  }, [token]);

  useEffect(() => {
    if (!kycLoaded) return;

    if (usePopulatedDemoNotifications) {
      setNotifications(
        MOCK_NOTIFICATIONS.map((n) => ({
          id: n.id,
          title: n.title || n.type || "Notification",
          message: n.message || n.body || "",
          time: formatRelativeTime(n.created_at || n.createdAt),
          timeShort: formatShortTime(n.created_at || n.createdAt),
          isRead: n.is_read ?? n.isRead ?? false,
          type: mapNotificationType(n.type),
        })),
      );
      setIsLoading(false);
      return;
    }

    if (useSetupNotifications) {
      setNotifications((prev) => {
        const inFlight = prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX));
        return [...inFlight, ...setupNotifications];
      });
      setIsLoading(false);
      return;
    }

    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch("/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown[]) => {
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
  }, [
    kycLoaded,
    token,
    mapApiNotifications,
    usePopulatedDemoNotifications,
    useSetupNotifications,
    setupNotifications,
  ]);

  useEffect(() => {
    if (!useSetupNotifications) return;
    setNotifications((prev) => {
      const inFlight = prev.filter((n) => n.id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX));
      return [...inFlight, ...setupNotifications];
    });
  }, [useSetupNotifications, setupNotifications]);

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
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX)) return;
      if (isSetupNotificationId(id)) {
        persistDismissedSetupNotificationId(userId, id);
        setDismissedTick((n) => n + 1);
        return;
      }
      if (DESIGN_MODE) return;
      if (token) {
        fetch(`/api/notifications/${id}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(console.error);
      }
    },
    [token, userId],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (isSetupNotificationId(n.id)) {
          persistDismissedSetupNotificationId(userId, n.id);
        }
      });
      return prev.map((n) => ({ ...n, isRead: true }));
    });
    setDismissedTick((n) => n + 1);
    if (DESIGN_MODE || useSetupNotifications) return;
    if (token) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error);
    }
  }, [token, userId, useSetupNotifications]);

  const removeNotification = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (id.startsWith(LOCAL_IN_FLIGHT_ID_PREFIX)) return;
      if (isSetupNotificationId(id)) {
        persistDismissedSetupNotificationId(userId, id);
        setDismissedTick((n) => n + 1);
        return;
      }
      if (DESIGN_MODE) return;
      if (token) {
        fetch(`/api/notifications/${id}/dismiss`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(console.error);
      }
    },
    [token, userId],
  );

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
    case "transaction":
      return "success";
    case "alert":
    case "security":
      return "warning";
    case "error":
      return "error";
    default:
      return "info";
  }
}
