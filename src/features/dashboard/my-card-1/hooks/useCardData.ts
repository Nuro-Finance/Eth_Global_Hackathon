"use client";

import { useState, useEffect } from "react";

export interface CardData {
  id: string;
  card_number: string;
  card_holder: string;
  card_name: string | null;
  balance: number;
  is_active: boolean;
  is_locked: boolean;
}

interface UseCardDataResult {
  card: CardData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * useCardData — fetches the current user's primary card from GET /cards.
 *
 * The Express backend returns cards from the local Postgres DB (cards table).
 * The JWT from next-auth session is included automatically by the browser
 * via cookies; the backend validates it against JWT_SECRET.
 */
export function useCardData(): UseCardDataResult {
  const [card, setCard] = useState<CardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCard = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/cards", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to fetch cards (${res.status})`);
        const data = await res.json();
 // Backend returns array; take the first active card
        const cards: CardData[] = Array.isArray(data) ? data : data.cards ?? [];
        setCard(cards[0] ?? null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCard();
    return () => controller.abort();
  }, []);

  return { card, isLoading, error };
}
