"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { MOCK_CARDS } from "@/config/mock-data";
import {
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  readDevNewUserEmpty,
  shouldUseDevPopulatedData,
} from "@/lib/devPreviewMode";

export interface PaymentCardOption {
  id: string;
  cardName: string;
  cardNumber: string;
}

export function formatPaymentCardLabel(card: PaymentCardOption): string {
  const digits = card.cardNumber.replace(/\D/g, "");
  const last4 = digits.slice(-4) || "????";
  return `${card.cardName} •••• ${last4}`;
}

function mapApiCard(c: Record<string, unknown>): PaymentCardOption {
  return {
    id: String(c.id),
    cardName: String(c.cardName ?? c.card_name ?? "Card"),
    cardNumber: String(c.cardNumber ?? c.card_number ?? ""),
  };
}

export function useDefaultPaymentCard() {
  const { data: session } = useAppSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;

  const [cards, setCards] = useState<PaymentCardOption[]>([]);
  const [savedDefaultId, setSavedDefaultId] = useState<string | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCards = async () => {
      if (shouldUseDevPopulatedData()) {
        const mock = MOCK_CARDS.map((c) => ({
          id: c.id,
          cardName: c.cardName,
          cardNumber: c.cardNumber,
        }));
        if (!cancelled) {
          setCards(mock);
          setCardsLoading(false);
        }
        return;
      }
      if (readDevNewUserEmpty()) {
        if (!cancelled) {
          setCards([]);
          setCardsLoading(false);
        }
        return;
      }

      setCardsLoading(true);
      try {
        const res = await fetch("/api/cards", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = res.ok ? await res.json() : [];
        const arr = Array.isArray(data) ? data : data.cards ?? [];
        const mapped = (arr as Record<string, unknown>[]).map(mapApiCard);
        if (!cancelled) setCards(mapped);
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setCardsLoading(false);
      }
    };

    void loadCards();
    const onPreview = () => void loadCards();
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreview);
    return () => {
      cancelled = true;
      window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreview);
    };
  }, [token]);

  useEffect(() => {
    if (!token || prefsLoaded) return;
    let cancelled = false;

    fetch("/api/users/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { defaultPaymentCardId?: string }) => {
        if (cancelled) return;
        if (data.defaultPaymentCardId) {
          setSavedDefaultId(data.defaultPaymentCardId);
        }
        setPrefsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPrefsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [token, prefsLoaded]);

  const firstCardId = cards[0]?.id ?? null;

  const effectiveDefaultId = useMemo(() => {
    if (savedDefaultId && cards.some((c) => c.id === savedDefaultId)) {
      return savedDefaultId;
    }
    return firstCardId;
  }, [cards, savedDefaultId, firstCardId]);

  const defaultCard = useMemo(
    () => cards.find((c) => c.id === effectiveDefaultId) ?? cards[0] ?? null,
    [cards, effectiveDefaultId]
  );

  const defaultCardLabel = defaultCard ? formatPaymentCardLabel(defaultCard) : null;

  const setDefaultPaymentCardId = useCallback(
    (cardId: string) => {
      setSavedDefaultId(cardId);
      if (token) {
        fetch("/api/users/preferences", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ defaultPaymentCardId: cardId }),
        }).catch(() => {});
      }
    },
    [token]
  );

  return {
    cards,
    cardsLoading,
    savedDefaultId,
    effectiveDefaultId,
    defaultCard,
    defaultCardLabel,
    setDefaultPaymentCardId,
  };
}
