"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, LayoutGrid, Table as TableIcon, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { PageHeader, PageTitle } from "@/components";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Home, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCardsState, useCardsStats } from "./hooks";
import { RefreshJustNowPill, useRefreshJustNowPill } from "./refreshJustNow";
import { AgentCardsTableView, CardsStats, CardsList } from "./components";
import { CardLimits } from "@/features/dashboard/my-card-1/components/CardLimits";
import { CardDetails as CardDetailsPane } from "@/features/dashboard/my-card-1/components/CardDetails";
import { CardSettings } from "@/features/dashboard/my-card-1/components/CardSettings";
import CardAgentChat from "../../components/CardAgentChat";
import SelfLearnFeed from "../../components/SelfLearnFeed";
import { CardControlsHeaderMenu } from "@/features/dashboard/my-card-1/components/CardControlsHeaderMenu";
import {
  CARD_CONTROLS_TABS_LIST_CLASS,
  CARD_CONTROLS_TAB_TRIGGER_CLASS,
} from "@/features/dashboard/my-card-1/components/cardControlsTabsStyles";
import { ReloadFlow } from "@/features/dashboard/my-card-1/components/ReloadFlow";
import { WithdrawFlow } from "@/features/dashboard/my-card-1/components/WithdrawFlow";
import { MY_CARD_NOIR_GRADIENT } from "@/lib/cardSkins";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";
import { TransactionsModal } from "../../components/TransactionsModal";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import { TransactionDetailModal } from "@/features/dashboard/transactions";
import type { Transaction } from "@/features/dashboard/transactions/shared";
import type { Card as CardType } from "../../shared";

type CardsGridMode = "agent" | "default";

interface CardsGridProps {
 /** Set from `agent-cards/page.tsx` so agent UI does not depend on pathname parsing. */
  mode?: CardsGridMode;
}

/**
 * CardsGrid - Main layout component for the cards page
 * Handles all state management and renders the cards UI
 */
export function CardsGrid({ mode }: CardsGridProps = {}) {
  const t = useTranslations("Cards");
  const pathname = usePathname();
  const isAgentCards = mode === "agent" || pathname.includes("/agent-cards");

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const {
    cards,
    selectedCard,
    handleSelectCard,
    handleLockToggle,
    handleDeleteCard,
    handleCardColorChange: cardsHandleCardColorChange,
    handleCardNameChange: cardsHandleCardNameChange,
    handleReorder: cardsHandleReorder,
    handleAddCard,
    isLoading: cardsLoading,
    isRefreshing,
    refresh,
  } = useCardsState();

  const { justNowVisible, runRefresh } = useRefreshJustNowPill();

  const stats = useCardsStats(cards, t);

 // Card Controls state (copied from My Card page)
  const [isFrozen, setIsFrozen] = useState(false);
  const [cardName, setCardName] = useState(cards[0]?.cardType || "");
  const [cardColor, setCardColor] = useState(MY_CARD_NOIR_GRADIENT);
  const [activePane, setActivePane] = useState<"controls" | "reload" | "withdraw">("controls");

 // Transactions modal state
  const [transactionsModalOpen, setTransactionsModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

 // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);

 // Get transactions data
  const {
    transactions,
    isLoading: transactionsLoading,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({ t: useTranslations("Transactions") });

 // Sync card state when selected card changes
  useEffect(() => {
    if (selectedCard) {
      setCardName(selectedCard.cardName || selectedCard.cardType);
      setIsFrozen(selectedCard.isLocked);
      setCardColor(selectedCard.cardColor || selectedCard.gradient);
    }
  }, [selectedCard]);

 // Handle card name update
  const handleCardNameChange = useCallback((newName: string) => {
    setCardName(newName);
 // Update the actual card data
    cardsHandleCardNameChange(selectedCard.id, newName);
  }, [selectedCard.id, cardsHandleCardNameChange]);

 // Handle card reorder
  const handleReorder = useCallback((reorderedCards: CardType[]) => {
    cardsHandleReorder(reorderedCards);
  }, [cardsHandleReorder]);

  return (
    <>
      {/* Page Header */}
      <PageHeader
        className="mb-2 md:mb-4"
        leftSection={
          <PageTitle
            title={isAgentCards ? "Agent Cards" : t("myCards")}
            subtitle={
              isAgentCards
                ? "Manage your agent cards and balances"
                : t("myCardsDescription")
            }
          />
        }
        rightSection={
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {isAgentCards && <RefreshJustNowPill visible={justNowVisible} />}
            {isAgentCards && (
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
            )}
            {isAgentCards && (
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
            )}
            {isAgentCards ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-9 min-h-9 max-h-9 px-3 !text-white font-normal"
                onClick={() => setUpgradeModalOpen(true)}
              >
                + New Card
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="w-auto h-9 min-h-9 max-h-9 px-3"
                    icon={<Plus className="w-4 h-4" />}
                    iconPosition="left"
                  >
                    {t("addNewCard")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 p-6" align="end">
                  <div className="text-center space-y-3">
                    <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      Coming Soon
                    </h1>
                    <h2 className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                      You will soon be able to create and manage multiple cards
                    </h2>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="mb-3 md:mb-4">
        <CardsStats stats={stats} isLoading={cardsLoading || isRefreshing} />
      </div>

      {/* Main Content */}
      {(!isAgentCards || viewMode === "grid") && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          {/* Left Column - Cards List (66%) */}
          <div className="space-y-4 lg:col-span-2">
            <CardsList
              cards={cards}
              selectedCardId={selectedCard.id}
              onSelectCard={handleSelectCard}
              onLockToggle={handleLockToggle}
              onDelete={handleDeleteCard}
              onReloadClick={() => setActivePane("reload")}
              onWithdrawClick={() => setActivePane("withdraw")}
              onTransactionsClick={() => setTransactionsModalOpen(true)}
              onReorder={handleReorder}
              isRefreshing={isRefreshing}
              perCardChat={isAgentCards}
            />
          </div>

          {/* Right Column - Card Controls (33%) */}
          <div className="space-y-4 lg:col-span-1">
            <div
              className={cn(
                "flex h-fit flex-col overflow-hidden rounded-[20px] bg-[var(--color-bg-secondary)] bg-clip-padding p-6 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)]",
                isAgentCards
                  ? "border-none"
                  : "border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)]",
              )}
            >
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
                      <TabsList
                        className={cn(
                          CARD_CONTROLS_TABS_LIST_CLASS,
                          process.env.NEXT_PUBLIC_AGENT_CHAT_ENABLED === "true" && "grid-cols-5",
                        )}
                      >
                        <TabsTrigger value="details" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Details
                        </TabsTrigger>
                        <TabsTrigger value="limits" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Limits
                        </TabsTrigger>
                        <TabsTrigger value="settings" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                          Settings
                        </TabsTrigger>
                        {process.env.NEXT_PUBLIC_AGENT_CHAT_ENABLED === "true" && (
                          <>
                            <TabsTrigger value="chat" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                              Chat
                            </TabsTrigger>
                            <TabsTrigger value="brain" className={CARD_CONTROLS_TAB_TRIGGER_CLASS}>
                              Brain
                            </TabsTrigger>
                          </>
                        )}
                      </TabsList>

                      <div className="-mx-2 px-2 pb-2">
                        <TabsContent value="details" className="m-0 data-[state=inactive]:hidden outline-none">
                          <CardDetailsPane
                            isFrozen={isFrozen}
                            onToggleFreeze={() => handleLockToggle(selectedCard.id)}
                            cardName={cardName}
                            setCardName={handleCardNameChange}
                            cardId={selectedCard?.id}
                            cardNumber={selectedCard.cardNumber}
                            expiryDate={selectedCard.expiryDate}
                          />
                        </TabsContent>
                        <TabsContent value="limits" className="m-0 data-[state=inactive]:hidden outline-none">
                          <CardLimits cardId={selectedCard?.id} />
                        </TabsContent>
                        <TabsContent value="settings" className="m-0 data-[state=inactive]:hidden outline-none">
                          <CardSettings
                            cardColor={cardColor}
                            setCardColor={(color) => cardsHandleCardColorChange(selectedCard.id, color)}
                            cardId={selectedCard?.id}
                          />
                        </TabsContent>
                        {process.env.NEXT_PUBLIC_AGENT_CHAT_ENABLED === "true" && (
                          <>
                            <TabsContent value="chat" className="m-0 data-[state=inactive]:hidden outline-none">
                              {selectedCard?.id ? (
                                <CardAgentChat
                                  cardId={selectedCard.id}
                                  cardName={cardName || selectedCard.cardType || "Card"}
                                />
                              ) : (
                                <div className="text-sm text-zinc-500 px-3 py-6">
                                  Select a card to chat with it.
                                </div>
                              )}
                            </TabsContent>
                            <TabsContent value="brain" className="m-0 data-[state=inactive]:hidden outline-none">
                              <SelfLearnFeed />
                            </TabsContent>
                          </>
                        )}
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
                      onClose={() => setActivePane("controls")}
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
                    <WithdrawFlow
                      onNext={() => {}}
                      onBack={() => {}}
                      onClose={() => setActivePane("controls")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {isAgentCards && viewMode === "table" && (
        <AgentCardsTableView
          cards={cards}
          onTransactionsClick={(card) => {
            handleSelectCard(card);
            setTransactionsModalOpen(true);
          }}
          onReorder={handleReorder}
        />
      )}

      {/* Transactions Modal */}
      <TransactionsModal
        open={transactionsModalOpen}
        onOpenChange={setTransactionsModalOpen}
        title={`${selectedCard.cardType} - Transactions`}
        transactions={transactions}
        isLoading={transactionsLoading}
        onTransactionSelect={handleTransactionSelect}
      />
      <TransactionDetailModal
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
        tx={selectedTransaction}
      />
      {isAgentCards && (
        <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />
      )}
    </>
  );
}
