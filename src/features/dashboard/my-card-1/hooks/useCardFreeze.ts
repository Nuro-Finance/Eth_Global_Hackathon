"use client";

import { useState, useCallback } from "react";

interface UseCardFreezeOptions {
 /** Local Nuro card UUID (cards.id in Postgres). Required to call the backend. */
  cardId: string | null;
 /** Initial frozen state loaded from the backend */
  initialFrozen?: boolean;
}

interface UseCardFreezeResult {
  isFrozen: boolean;
  isLoading: boolean;
  error: string | null;
  toggleFreeze: () => Promise<void>;
}

/**
 * useCardFreeze - manages card freeze state and syncs it with the backend.
 *
 * Flow:
 * toggle clicked → optimistic UI update → PATCH /api/cards/[id]/freeze
 * → Next.js route proxies to Express backend
 * → Express updates cards.is_frozen + calls Issuer API to suspend/activate
 * → on error: rolls back optimistic update
 *
 * Requires `cardId` to be set (fetched from GET /users/me → cards[0].id).
 * When cardId is null the toggle is purely local (graceful degradation).
 */
export function useCardFreeze({
  cardId,
  initialFrozen = false,
}: UseCardFreezeOptions): UseCardFreezeResult {
  const [isFrozen, setIsFrozen] = useState(initialFrozen);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFreeze = useCallback(async () => {
    const next = !isFrozen;

 // Optimistic update
    setIsFrozen(next);
    setError(null);

 // If no cardId yet (auth/data not loaded), stay local-only
    if (!cardId) {
      console.warn("[useCardFreeze] cardId not available - freeze is local only");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/freeze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozen: next }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Freeze failed (${res.status})`);
      }
    } catch (err) {
 // Roll back optimistic update on failure
      setIsFrozen(!next);
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("[useCardFreeze] failed to toggle freeze:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isFrozen, cardId]);

  return { isFrozen, isLoading, error, toggleFreeze };
}
