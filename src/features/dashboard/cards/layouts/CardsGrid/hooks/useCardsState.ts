"use client";
import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { Card } from "../../../shared";
import { MOCK_CARDS } from "@/config/mock-data";
import { useAgentCardsDataMode } from "@/features/dashboard/agent-cards/AgentCardsDataModeContext";
import {
  AGENT_CARDS_FIRST_TIME_CLEARED_EVENT,
  AGENT_CARDS_FIRST_TIME_RESTORED_EVENT,
  resolveAgentCardsDesignSampleUsage,
} from "@/features/dashboard/agent-cards/hooks/agentCardsDesignSampleData";
import {
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  readDevNewUserEmpty,
  shouldUseDevPopulatedData,
} from "@/lib/devPreviewMode";

function mapMockCard(c: (typeof MOCK_CARDS)[number]): Card {
  return {
    id: c.id,
    cardNumber: c.cardNumber,
    cardHolder: c.cardHolder,
    expiryDate: c.expiryDate,
    cardType: c.cardType,
    gradient: c.gradient,
    cardColor: c.cardColor || c.gradient,
    cardName: c.cardName,
    balance: c.balance,
    isActive: c.isActive,
    isLocked: c.isLocked,
    dailyLimit: c.dailyLimit,
  };
}

function resolveCardsDevMockCards(
    agentCardsMode: ReturnType<typeof useAgentCardsDataMode>,
): boolean {
    const agentUsage = resolveAgentCardsDesignSampleUsage(agentCardsMode);
    if (agentCardsMode !== null) return agentUsage === true;
    return shouldUseDevPopulatedData();
}

function resolveCardsDevEmpty(
    agentCardsMode: ReturnType<typeof useAgentCardsDataMode>,
): boolean {
    const agentUsage = resolveAgentCardsDesignSampleUsage(agentCardsMode);
    if (agentCardsMode !== null) return agentUsage === false;
    return readDevNewUserEmpty();
}

export function useCardsState() {
    const { data: session } = useSession();
    const agentCardsMode = useAgentCardsDataMode();
    const [cards, setCards] = useState<Card[]>([]);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadCards = useCallback(async (opts?: { refresh?: boolean }) => {
        const isRefresh = opts?.refresh ?? false;
        if (resolveCardsDevMockCards(agentCardsMode)) {
            const mapped = MOCK_CARDS.map(mapMockCard);
            setCards(mapped);
            setSelectedCard((prev) => {
                if (!prev) return mapped[0] ?? null;
                return mapped.find((c) => c.id === prev.id) ?? mapped[0] ?? null;
            });
            if (!isRefresh) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
            return;
        }
        if (resolveCardsDevEmpty(agentCardsMode)) {
            setCards([]);
            setSelectedCard(null);
            if (!isRefresh) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
            return;
        }

        if (!isRefresh) setIsLoading(true);
        else setIsRefreshing(true);
        const token = (session as { accessToken?: string } | null)?.accessToken;
        fetch("/api/cards", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((data: unknown) => {
                const arr = Array.isArray(data) ? data : (data as { cards?: unknown[] }).cards || [];
                const fetched: Card[] = (arr as Record<string, unknown>[]).map((c) => ({
                    id: String(c.id),
                    cardNumber: String(c.cardNumber || c.card_number || ""),
                    cardHolder: String(c.cardHolder || c.card_holder || "Card Holder"),
                    expiryDate: String(c.expiryDate || c.expiry_date || ""),
                    cardType: String(c.cardType || c.card_type || "VISA"),
                    gradient: String(
                      c.gradient ||
                        "linear-gradient(135deg, #151313 0%, #6a6a6a 30%, #0f0f0f 100%)",
                    ),
                    cardColor: String(c.cardColor || c.gradient || ""),
                    cardName: String(c.cardName || c.card_name || ""),
                    balance:
                      typeof c.balance === "number"
                        ? c.balance
                        : parseFloat(String(c.balance)) || 0,
                    isActive: (c.isActive ?? c.is_active ?? true) as boolean,
                    isLocked: (c.isLocked ?? c.is_locked ?? false) as boolean,
                    dailyLimit: Number(c.dailyLimit ?? 500),
                }));
                setCards(fetched);
                setSelectedCard((prev) => {
                    if (fetched.length === 0) return null;
                    if (!prev) return fetched[0];
                    return fetched.find((c) => c.id === prev.id) ?? fetched[0];
                });
            })
            .catch((err) => {
                console.warn("[useCardsState] fetch failed:", err);
                setCards([]);
                setSelectedCard(null);
            })
            .finally(() => {
                if (!isRefresh) {
                    setIsLoading(false);
                    setIsRefreshing(false);
                }
            });
    }, [session, agentCardsMode]);

    useEffect(() => {
        void loadCards();
    }, [loadCards]);

    const refresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        const started = Date.now();
        try {
            await loadCards({ refresh: true });
        } finally {
            const remaining = Math.max(0, 400 - (Date.now() - started));
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
            setIsRefreshing(false);
        }
    }, [isRefreshing, loadCards]);

    useEffect(() => {
        const onPreviewChange = () => loadCards();
        window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreviewChange);
        window.addEventListener(AGENT_CARDS_FIRST_TIME_CLEARED_EVENT, onPreviewChange);
        window.addEventListener(AGENT_CARDS_FIRST_TIME_RESTORED_EVENT, onPreviewChange);
        return () => {
            window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreviewChange);
            window.removeEventListener(AGENT_CARDS_FIRST_TIME_CLEARED_EVENT, onPreviewChange);
            window.removeEventListener(AGENT_CARDS_FIRST_TIME_RESTORED_EVENT, onPreviewChange);
        };
    }, [loadCards]);

 // M12 Day 1 UI-state-sync ( lock 2026-05-29): listen for
 // chat-driven state changes (e.g. agent invokes freeze_card via
 // tool_use, backend updates DB, chat response carries stateChanges,
 // InlineCardChat dispatches "nuro:state-changed" CustomEvent). When
 // we hear one for a card we own, patch the local card object so the
 // UI reflects the new state in the same animation frame as the
 // agent's reply. Without this, the agent says "frozen" but the card
 // visual stays Active = trust failure 2.0.
 //
 // Patch shape: { entity: 'card', id: '<cardId>', patch: { is_locked: true } }
 // Both snake_case (DB) AND camelCase (UI) keys are written so any
 // consumer reads the correct value regardless of casing convention.
    useEffect(() => {
        const onStateChange = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (!detail || detail.entity !== "card" || !detail.id) return;
            const patch = detail.patch as Record<string, unknown>;
            if (!patch) return;
 // Normalize snake_case keys to the camelCase the Card type uses.
            const normalized: Partial<Card> = {};
            if ("is_locked" in patch) normalized.isLocked = Boolean(patch.is_locked);
            if ("isLocked" in patch) normalized.isLocked = Boolean(patch.isLocked);
            if ("is_active" in patch) normalized.isActive = Boolean(patch.is_active);
            if ("isActive" in patch) normalized.isActive = Boolean(patch.isActive);
            if ("balance" in patch) normalized.balance = Number(patch.balance);
            if ("card_name" in patch) normalized.cardName = String(patch.card_name);
            if ("cardName" in patch) normalized.cardName = String(patch.cardName);
            if ("gradient" in patch) normalized.gradient = String(patch.gradient);
            if (Object.keys(normalized).length === 0) return;
            setCards((prev) =>
                prev.map((c) => (c.id === detail.id ? { ...c, ...normalized } : c)),
            );
            setSelectedCard((prev) =>
                prev && prev.id === detail.id ? { ...prev, ...normalized } : prev,
            );
        };
        window.addEventListener("nuro:state-changed", onStateChange as EventListener);
        return () => window.removeEventListener("nuro:state-changed", onStateChange as EventListener);
    }, []);

 // Card creation DISABLED until Issuer card provisioning is working.
 // Prevents ghost cards from being created in the DB.
    const handleAddCard = useCallback(async () => {
        alert("Card creation is temporarily disabled. Complete KYC to enable card provisioning through our banking partner.");
    }, []);

    const handleLockToggle = useCallback(
        async (cardId: string) => {
            const card = cards.find((c) => c.id === cardId);
            if (!card) return;
            const token = (session as { accessToken?: string } | null)?.accessToken;
 // Optimistic UI update
            setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, isLocked: !c.isLocked } : c));
            setSelectedCard((prev) => prev && prev.id === cardId ? { ...prev, isLocked: !prev.isLocked } : prev);
 // Persist to backend
            fetch(`/api/cards/${cardId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ is_locked: !card.isLocked }),
            }).catch((err) => console.warn("[useCardsState] lock toggle failed:", err));
        },
        [cards, session]
    );

    const handleDeleteCard = useCallback(
        (cardId: string) => {
            setCards((prevCards) => {
                const updatedCards = prevCards.filter((card) => card.id !== cardId);
                if (selectedCard?.id === cardId && updatedCards.length > 0) {
                    setSelectedCard(updatedCards[0]);
                }
                return updatedCards;
            });
        },
        [selectedCard?.id]
    );

    const handleSelectCard = useCallback((card: Card) => {
        setSelectedCard(card);
    }, []);

    const handleCardColorChange = useCallback(
        (cardId: string, color: string) => {
            setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, cardColor: color } : c));
            setSelectedCard((prev) => prev && prev.id === cardId ? { ...prev, cardColor: color } : prev);
 // Persist gradient to DB
            const token = (session as { accessToken?: string } | null)?.accessToken;
            fetch(`/api/cards/${cardId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ gradient: color }),
            }).catch((err) => console.warn("[useCardsState] color change failed:", err));
        },
        [session]
    );

    const handleCardNameChange = useCallback(
        (cardId: string, name: string) => {
            setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, cardName: name } : c));
            setSelectedCard((prev) => prev && prev.id === cardId ? { ...prev, cardName: name } : prev);
 // Persist
            const token = (session as { accessToken?: string } | null)?.accessToken;
            fetch(`/api/cards/${cardId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ card_name: name }),
            }).catch((err) => console.warn("[useCardsState] name change failed:", err));
        },
        [session]
    );

    const handleReorder = useCallback((newCards: Card[]) => {
        setCards(newCards);
    }, []);

    return {
        cards,
        selectedCard: selectedCard || cards[0] || ({} as Card),
        isLoading,
        isRefreshing,
        refresh,
        handleAddCard,
        handleLockToggle,
        handleDeleteCard,
        handleSelectCard,
        handleCardColorChange,
        handleCardNameChange,
        handleReorder,
    };
}
