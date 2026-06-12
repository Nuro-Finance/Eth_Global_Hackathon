"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Table as TableIcon, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { PageHeader, PageTitle } from "@/components";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { isDevPreviewAvailable } from "@/lib/devPreviewMode";
import { MOCK_CARDS } from "@/config/mock-data";
import { useCardsState, useCardsStats } from "@/features/dashboard/cards/layouts/CardsGrid/hooks";
import {
  RefreshJustNowPill,
  useRefreshJustNowPill,
} from "@/features/dashboard/cards/layouts/CardsGrid/refreshJustNow";
import { CardListItem } from "@/features/dashboard/cards";
import {
  AgentCardsTableView,
  CardsStats,
  CardsList,
} from "@/features/dashboard/cards/layouts/CardsGrid/components";
import { CardLimits } from "@/features/dashboard/my-card-1/components/CardLimits";
import { CardDetails } from "@/features/dashboard/my-card-1/components/CardDetails";
import { CardSettings } from "@/features/dashboard/my-card-1/components/CardSettings";
import { ReloadFlow } from "@/features/dashboard/my-card-1/components/ReloadFlow";
import { WithdrawFlow } from "@/features/dashboard/my-card-1/components/WithdrawFlow";
import { FirstFreezeNoticeDialog } from "@/features/dashboard/my-card-1/components/FirstFreezeNoticeDialog";
import { CardControlsHeaderMenu } from "@/features/dashboard/my-card-1/components/CardControlsHeaderMenu";
import {
  CARD_CONTROLS_TABS_LIST_CLASS,
  CARD_CONTROLS_TAB_TRIGGER_CLASS,
} from "@/features/dashboard/my-card-1/components/cardControlsTabsStyles";
import { MY_CARD_NOIR_GRADIENT } from "@/lib/cardSkins";
import {
  AGENT_CARDS_FIRST_TIME_CLEARED_EVENT,
  AGENT_CARDS_FIRST_TIME_RESTORED_EVENT,
  shouldUseAgentCardsFirstTimeSampleData,
} from "./hooks/agentCardsDesignSampleData";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";
import type { Card as CardType } from "@/features/dashboard/cards/shared";

const AGENT_FIRST_TIME_PLACEHOLDER_CARD: CardType = {
  id: "agent-first-time-placeholder",
  cardNumber: "4532019877411234",
  cardHolder: "Card Holder",
  expiryDate: "12/28",
  cardType: "VISA",
  gradient: MY_CARD_NOIR_GRADIENT,
  cardColor: MY_CARD_NOIR_GRADIENT,
  cardName: "My Card",
  balance: 0,
  isActive: false,
  isLocked: false,
  dailyLimit: 2000,
};

/**
 * Agent Cards first-time user (empty) experience.
 * Edit this file only — existing page stays frozen in AgentCardsExistingPage.
 */
export default function AgentCardsFirstTimeUserPage() {
  const t = useTranslations("Cards");
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const {
    cards,
    selectedCard,
    handleSelectCard,
    handleLockToggle,
    handleDeleteCard,
    handleCardColorChange,
    handleCardNameChange: cardsHandleCardNameChange,
    handleReorder: cardsHandleReorder,
    isLoading: cardsLoading,
    isRefreshing,
    refresh,
  } = useCardsState();

  const { justNowVisible, runRefresh } = useRefreshJustNowPill();

  const stats = useCardsStats(cards, t);
  const hasCards = cards.length > 0;

  const [cardId, setCardId] = React.useState<string | null>(null);
  const [isFrozen, setIsFrozen] = React.useState(false);
  const [cardName, setCardName] = React.useState("My Card");
  const [cardNumber, setCardNumber] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [cardColor, setCardColor] = React.useState(MY_CARD_NOIR_GRADIENT);
  const [activePane, setActivePane] = React.useState<"controls" | "reload" | "withdraw">(
    "controls",
  );
  const [freezeNoticeOpen, setFreezeNoticeOpen] = React.useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const prevFrozenRef = React.useRef(false);

  const applyFirstTimeCardData = React.useCallback(() => {
    if (isDevPreviewAvailable()) {
      if (!shouldUseAgentCardsFirstTimeSampleData()) {
        setCardId(null);
        setCardName("My Card");
        setCardNumber("");
        setExpiryDate("");
        setIsFrozen(false);
        setCardColor(MY_CARD_NOIR_GRADIENT);
        return;
      }
      const c = MOCK_CARDS[0];
      if (c) {
        setCardId(c.id);
        setCardName(c.cardName || "My Card");
        setCardNumber(c.cardNumber || "");
        setExpiryDate(c.expiryDate || "");
        setIsFrozen(c.isLocked ?? false);
        if (c.gradient) setCardColor(c.gradient);
      }
      return;
    }

    const token = (session as { accessToken?: string })?.accessToken;
    if (!token) return;
    fetch("/api/cards", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const list = Array.isArray(data)
          ? data
          : (data as { cards?: unknown[] })?.cards || [];
        if (list.length > 0) {
          const c = list[0] as Record<string, unknown>;
          setCardId(String(c.id ?? ""));
          setCardName(String(c.cardName ?? c.card_name ?? "My Card"));
          setCardNumber(String(c.cardNumber ?? c.card_number ?? ""));
          setExpiryDate(String(c.expiryDate ?? c.expiry_date ?? ""));
          setIsFrozen(Boolean(c.isLocked ?? c.is_locked ?? false));
          if (c.gradient) setCardColor(String(c.gradient));
        }
      })
      .catch((err) => console.warn("[AgentCardsFirstTime] fetch cards failed:", err));
  }, [session]);

  React.useEffect(() => {
    applyFirstTimeCardData();
    const sync = () => applyFirstTimeCardData();
    window.addEventListener(AGENT_CARDS_FIRST_TIME_CLEARED_EVENT, sync);
    window.addEventListener(AGENT_CARDS_FIRST_TIME_RESTORED_EVENT, sync);
    return () => {
      window.removeEventListener(AGENT_CARDS_FIRST_TIME_CLEARED_EVENT, sync);
      window.removeEventListener(AGENT_CARDS_FIRST_TIME_RESTORED_EVENT, sync);
    };
  }, [applyFirstTimeCardData]);

  useEffect(() => {
    if (!hasCards || !selectedCard?.id) return;
    setCardId(selectedCard.id);
    setCardName(selectedCard.cardName || selectedCard.cardType);
    setIsFrozen(selectedCard.isLocked);
    setCardNumber(selectedCard.cardNumber || "");
    setExpiryDate(selectedCard.expiryDate || "");
    setCardColor(selectedCard.cardColor || selectedCard.gradient || MY_CARD_NOIR_GRADIENT);
  }, [hasCards, selectedCard]);

  React.useEffect(() => {
    let openTimer: ReturnType<typeof setTimeout> | undefined;

    if (!isFrozen) {
      prevFrozenRef.current = false;
      setFreezeNoticeOpen(false);
      return;
    }

    if (!prevFrozenRef.current) {
      prevFrozenRef.current = true;
      openTimer = setTimeout(() => {
        setFreezeNoticeOpen(true);
      }, 500);
    }

    return () => {
      if (openTimer !== undefined) {
        clearTimeout(openTimer);
      }
    };
  }, [isFrozen]);

  const handleToggleFreeze = React.useCallback(() => {
    const next = !isFrozen;
    setIsFrozen(next);
    if (!cardId) return;
    const token = (session as { accessToken?: string })?.accessToken;
    fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ is_locked: next }),
    }).catch((err) => console.warn("[AgentCardsFirstTime] freeze toggle failed:", err));
  }, [isFrozen, cardId, session]);

  const handleCardNameChange = useCallback(
    (newName: string) => {
      setCardName(newName);
      if (hasCards && selectedCard?.id) {
        cardsHandleCardNameChange(selectedCard.id, newName);
      }
    },
    [hasCards, selectedCard?.id, cardsHandleCardNameChange],
  );

  const handleReorder = useCallback(
    (reorderedCards: CardType[]) => {
      cardsHandleReorder(reorderedCards);
    },
    [cardsHandleReorder],
  );

  const handleClose = useCallback(() => setActivePane("controls"), []);

  useEffect(() => {
    if (!hasCards && viewMode === "table") {
      setViewMode("grid");
    }
  }, [hasCards, viewMode]);

  return (
    <>
      <FirstFreezeNoticeDialog open={freezeNoticeOpen} onOpenChange={setFreezeNoticeOpen} />

      <PageHeader
        className="mb-2 md:mb-4"
        leftSection={
          <PageTitle
            title="Agent Cards"
            subtitle="Manage your agent cards and balances"
          />
        }
        rightSection={
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <RefreshJustNowPill visible={justNowVisible} />
            <div
              className="box-border inline-flex h-9 min-h-9 max-h-9 shrink-0 items-center gap-0.5 rounded-[10px] bg-[var(--color-bg-secondary)] p-1"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                aria-label="Table view"
                aria-pressed={viewMode === "table"}
                onClick={() => setViewMode("table")}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-none transition-all",
                  viewMode === "table"
                    ? "bg-white/[0.04] text-white/70"
                    : "bg-transparent text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-white/70",
                )}
              >
                <TableIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-none transition-all",
                  viewMode === "grid"
                    ? "bg-white/[0.04] text-white/70"
                    : "bg-transparent text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-white/70",
                )}
              >
                <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <TooltipProvider delayDuration={0} skipDelayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void runRefresh(refresh)}
                    disabled={isRefreshing}
                    className={cn(
                      "inline-flex h-9 w-9 min-h-9 max-h-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] border-none text-white/70 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                      isRefreshing && "cursor-default opacity-60",
                    )}
                    aria-label="Refresh"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4 shrink-0 origin-center opacity-90",
                        isRefreshing && "animate-spin",
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Refresh
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-9 min-h-9 max-h-9 px-3 !text-white font-normal"
              onClick={() => setUpgradeModalOpen(true)}
            >
              + New Card
            </Button>
          </div>
        }
      />

      <div className="mb-3 md:mb-4">
        <CardsStats stats={stats} isLoading={cardsLoading || isRefreshing} />
      </div>

      {viewMode === "grid" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          <div className="space-y-4 lg:col-span-2">
            {hasCards ? (
              <CardsList
                cards={cards}
                selectedCardId={selectedCard.id}
                onSelectCard={handleSelectCard}
                onLockToggle={handleLockToggle}
                onDelete={handleDeleteCard}
                onReloadClick={() => setActivePane("reload")}
                onWithdrawClick={() => setActivePane("withdraw")}
                onReorder={handleReorder}
                isRefreshing={isRefreshing}
              />
            ) : (
              <CardListItem
                card={AGENT_FIRST_TIME_PLACEHOLDER_CARD}
                isSelected
                hideStatusBadge
                menuActionsDisabled
                onSelect={() => {}}
                onLockToggle={() => {}}
                onDelete={() => {}}
                primaryCtaLabel="Activate Card"
                onReloadClick={() => setUpgradeModalOpen(true)}
              />
            )}
          </div>

          <div className="space-y-4 lg:col-span-1">
            <div className="flex h-fit flex-col overflow-hidden rounded-[20px] border-none bg-[var(--color-bg-secondary)] bg-clip-padding p-6 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)]">
              <AnimatePresence mode="wait">
                {activePane === "controls" && (
                  <motion.div
                    key="controls"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="flex flex-col gap-6 w-full h-fit"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                        Card Controls
                      </h3>
                      <CardControlsHeaderMenu />
                    </div>

                    <Tabs defaultValue="details" className="w-full flex flex-col h-fit">
                      <TabsList className={CARD_CONTROLS_TABS_LIST_CLASS}>
                        <TabsTrigger value="details" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Details
                        </TabsTrigger>
                        <TabsTrigger value="limits" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Limits
                        </TabsTrigger>
                        <TabsTrigger value="settings" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Settings
                        </TabsTrigger>
                      </TabsList>

                      <div className="-mx-2 px-2 pb-2">
                        <TabsContent
                          value="details"
                          className="m-0 data-[state=inactive]:hidden outline-none"
                        >
                          <CardDetails
                            isFrozen={isFrozen}
                            onToggleFreeze={handleToggleFreeze}
                            cardName={cardName}
                            setCardName={handleCardNameChange}
                            cardId={cardId}
                            cardNumber={cardNumber}
                            expiryDate={expiryDate}
                          />
                        </TabsContent>
                        <TabsContent
                          value="limits"
                          className="m-0 data-[state=inactive]:hidden outline-none"
                        >
                          <CardLimits cardId={cardId ?? undefined} />
                        </TabsContent>
                        <TabsContent
                          value="settings"
                          className="m-0 data-[state=inactive]:hidden outline-none"
                        >
                          <CardSettings
                            cardColor={cardColor}
                            setCardColor={setCardColor}
                            cardId={cardId ?? undefined}
                          />
                        </TabsContent>
                      </div>
                    </Tabs>
                  </motion.div>
                )}

                {activePane === "reload" && (
                  <motion.div
                    key="reload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="flex flex-col gap-6 w-full h-fit"
                  >
                    <ReloadFlow
                      onNext={() => {}}
                      onBack={() => {}}
                      onClose={handleClose}
                    />
                  </motion.div>
                )}

                {activePane === "withdraw" && (
                  <motion.div
                    key="withdraw"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="flex flex-col gap-6 w-full h-fit"
                  >
                    <WithdrawFlow onNext={() => {}} onBack={() => {}} onClose={handleClose} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {viewMode === "table" && (
        <AgentCardsTableView
          cards={cards}
          onTransactionsClick={handleSelectCard}
          onReorder={handleReorder}
          emptyMessage="Create your first agent card"
        />
      )}

      <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />
    </>
  );
}
