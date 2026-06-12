"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { shouldUseDevPopulatedData } from "@/lib/devPreviewMode";

export interface CardControls {
  daily_limit: number;
  daily_used: number;
  monthly_limit: number;
  monthly_used: number;
  per_tx_limit: number;
  velocity_per_hr: number;
  alert_threshold: number;
  alert_enabled: boolean;
  intl_enabled: boolean;
  online_enabled: boolean;
  atm_enabled: boolean;
  contactless_enabled: boolean;
}

const DEFAULTS: CardControls = {
  daily_limit: 5000,
  daily_used: 0,
  monthly_limit: 50000,
  monthly_used: 0,
  per_tx_limit: 10000,
  velocity_per_hr: 10,
  alert_threshold: 500,
  alert_enabled: true,
  intl_enabled: true,
  online_enabled: true,
  atm_enabled: true,
  contactless_enabled: true,
};

export function useCardControls(cardId: string | undefined) {
  const { data: session } = useSession();
  const [controls, setControls] = useState<CardControls>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setIsLoading(false);
      return;
    }
    if (shouldUseDevPopulatedData()) {
      setControls(DEFAULTS);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const token = (session as any)?.accessToken;
    fetch(`/api/cards/${cardId}/controls`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => {
        setControls({ ...DEFAULTS, ...data });
        setError(null);
      })
      .catch((err) => {
        console.warn("[useCardControls] fetch failed, using defaults:", err);
        setControls(DEFAULTS);
        setError(String(err));
      })
      .finally(() => setIsLoading(false));
  }, [cardId, session]);

  const saveControls = useCallback(
    async (updates: Partial<CardControls>) => {
      if (!cardId) return;
      setIsSaving(true);
      const token = (session as any)?.accessToken;
      try {
        const res = await fetch(`/api/cards/${cardId}/controls`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const data = await res.json();
          setControls((prev) => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error("[useCardControls] save failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [cardId, session]
  );

  return { controls, isLoading, error, isSaving, saveControls, setControls };
}
