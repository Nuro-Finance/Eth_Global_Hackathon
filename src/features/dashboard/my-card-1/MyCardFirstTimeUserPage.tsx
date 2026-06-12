"use client";

import React, { useState, useMemo } from "react";
import { Search, RefreshCw } from "lucide-react";
import { useAppSession } from "@/hooks/useAppSession";
import { DataStatusPill, PageHeader, PageTitle } from "@/components";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { subscribeDashboardInFlightOperation } from "@/lib/dashboardInFlightOperation";
import { DashboardInFlightBanner } from "@/layouts/Header/components/DashboardInFlightBanner";
import CardSection from "@/features/dashboard/overview/components/CardSection";
import { TransactionsTable, TransactionDetailModal } from "@/features/dashboard/transactions";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import { CardLimits } from "./components/CardLimits";
import { CardDetails } from "./components/CardDetails";
import { CardSettings } from "./components/CardSettings";
import { ReloadFlow } from "./components/ReloadFlow";
import { WithdrawFlow } from "./components/WithdrawFlow";
import { FirstFreezeNoticeDialog } from "./components/FirstFreezeNoticeDialog";
import { CardControlsHeaderMenu } from "./components/CardControlsHeaderMenu";
import {
  CARD_CONTROLS_TABS_LIST_CLASS,
  CARD_CONTROLS_TAB_TRIGGER_CLASS,
} from "./components/cardControlsTabsStyles";
import { MY_CARD_NOIR_GRADIENT, resolveMyCardThemeSwatch } from "@/lib/cardSkins";
import { isDevPreviewAvailable } from "@/lib/devPreviewMode";
import { MOCK_CARDS } from "@/config/mock-data";
import {
  MY_CARD_FIRST_TIME_CLEARED_EVENT,
  MY_CARD_FIRST_TIME_RESTORED_EVENT,
  shouldUseMyCardFirstTimeSampleData,
} from "./hooks/myCardDesignSampleData";

import { AnimatePresence, motion } from "framer-motion";
import { WidgetCard } from "@/features/dashboard/overview/shared";

export default function MyCardFirstTimeUserPage() {
  const t = useTranslations("Transactions");
  const { data: session } = useAppSession();

  const {
    transactions,
    isLoading,
    dataState,
    refresh,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({ t });

  const [cardId, setCardId] = React.useState<string | null>(null);
  const [isFrozen, setIsFrozen] = React.useState(false);
  const [cardName, setCardName] = React.useState("My Card");
  const [cardNumber, setCardNumber] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [cardColor, setCardColor] = React.useState(MY_CARD_NOIR_GRADIENT);
  const [activePane, setActivePane] = React.useState<"controls" | "reload" | "withdraw">("controls");
  const [freezeNoticeOpen, setFreezeNoticeOpen] = React.useState(false);
  const [cardTxSearch, setCardTxSearch] = useState("");
  const filteredTransactions = useMemo(() => {
    if (!cardTxSearch) return transactions;
    const q = cardTxSearch.toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.name.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q) ||
        tx.status.toLowerCase().includes(q),
    );
  }, [transactions, cardTxSearch]);
  const prevFrozenRef = React.useRef(false);

  const applyFirstTimeCardData = React.useCallback(() => {
    if (isDevPreviewAvailable()) {
      if (!shouldUseMyCardFirstTimeSampleData()) {
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
        setCardColor(resolveMyCardThemeSwatch(c.gradient));
      }
      return;
    }

    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/cards", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any) => {
        const cards = Array.isArray(data) ? data : data.cards || [];
        if (cards.length > 0) {
          const c = cards[0];
          setCardId(c.id);
          setCardName(c.cardName || c.card_name || "My Card");
          setCardNumber(c.cardNumber || c.card_number || "");
          setExpiryDate(c.expiryDate || c.expiry_date || "");
          setIsFrozen(c.isLocked ?? c.is_locked ?? false);
          setCardColor(resolveMyCardThemeSwatch(c.gradient));
        }
      })
      .catch((err) => console.warn("[MyCardFirstTime] fetch cards failed:", err));
  }, [session]);

  React.useEffect(() => {
    applyFirstTimeCardData();
    const sync = () => applyFirstTimeCardData();
    window.addEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
    window.addEventListener(MY_CARD_FIRST_TIME_RESTORED_EVENT, sync);
    return () => {
      window.removeEventListener(MY_CARD_FIRST_TIME_CLEARED_EVENT, sync);
      window.removeEventListener(MY_CARD_FIRST_TIME_RESTORED_EVENT, sync);
    };
  }, [applyFirstTimeCardData]);

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

 // Persist freeze toggle to backend
  const handleToggleFreeze = React.useCallback(() => {
    const next = !isFrozen;
    setIsFrozen(next);
    if (!cardId) return;
    const token = (session as any)?.accessToken;
    fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ is_locked: next }),
    }).catch((err) => console.warn("[MyCard1] freeze toggle failed:", err));
  }, [isFrozen, cardId, session]);

  const handleClose = React.useCallback(() => setActivePane("controls"), []);
  const handleNext = React.useCallback(() => { }, []);
  const handleBack = React.useCallback(() => { }, []);

  React.useEffect(
    () =>
      subscribeDashboardInFlightOperation(() => {
        void refresh();
      }),
    [refresh],
  );

  return (
    <div>
      <FirstFreezeNoticeDialog open={freezeNoticeOpen} onOpenChange={setFreezeNoticeOpen} />

      <PageHeader
        className="mb-2 md:mb-4"
        leftSection={
          <PageTitle
            title="My Card"
            subtitle="Manage your personal account and card settings."
          />
        }
        rightSection={
          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
            <div className="flex items-center gap-2">
              <DashboardInFlightBanner />
              <DataStatusPill state={dataState} variant="toolbar" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={
                      dataState.status === "loading" || dataState.status === "refreshing"
                    }
                    className={cn(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] border-none text-white/70 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                      (dataState.status === "loading" || dataState.status === "refreshing") &&
                        "cursor-default opacity-60",
                    )}
                    aria-label="Refresh"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4 shrink-0 origin-center opacity-90",
                        (dataState.status === "loading" ||
                          dataState.status === "refreshing") &&
                          "animate-spin",
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
            </div>
          </TooltipProvider>
        }
      />

      <div
        className="grid grid-cols-1 gap-4 [grid-template-areas:'card'_'sidebar'_'transactions'] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:[grid-template-areas:'card_sidebar'_'transactions_sidebar']"
      >
        <div className="min-w-0 [grid-area:card] lg:self-start">
          <CardSection
            isFrozen={isFrozen}
            onToggleFreeze={handleToggleFreeze}
            cardName={cardName}
            cardColor={cardColor}
            onReloadClick={() => setActivePane("reload")}
            onWithdrawClick={() => setActivePane("withdraw")}
          />
        </div>

        <div
          className="[grid-area:sidebar] flex h-fit flex-col overflow-hidden rounded-[20px] border-none bg-[var(--color-bg-secondary)] bg-clip-padding p-6 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] lg:row-span-2 lg:self-start"
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
                    <TabsContent value="details" className="m-0 data-[state=inactive]:hidden outline-none">
                      <CardDetails
                        isFrozen={isFrozen}
                        onToggleFreeze={handleToggleFreeze}
                        cardName={cardName}
                        setCardName={setCardName}
                        cardId={cardId}
                        cardNumber={cardNumber}
                        expiryDate={expiryDate}
                      />
                    </TabsContent>
                    <TabsContent value="limits" className="m-0 data-[state=inactive]:hidden outline-none">
                      <CardLimits cardId={cardId ?? undefined} />
                    </TabsContent>
                    <TabsContent value="settings" className="m-0 data-[state=inactive]:hidden outline-none">
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
                  onNext={handleNext}
                  onBack={handleBack}
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
                <WithdrawFlow onNext={handleNext} onBack={handleBack} onClose={handleClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="min-w-0 [grid-area:transactions] mt-2 [overflow-anchor:none] lg:mt-0 lg:self-start">
          <WidgetCard
            title="Recent Transactions"
            subtitle="Card transaction history"
            fullHeight={false}
            status={
              <div className="relative mt-1.5 hidden sm:block w-36 lg:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("search") || "Search..."}
                  value={cardTxSearch}
                  onChange={(e) => setCardTxSearch(e.target.value)}
                  className="w-full h-8 pl-10 pr-3 text-sm rounded-[var(--radius-sm)] border border-transparent bg-white/[0.05] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-input-focus)]"
                />
              </div>
            }
          >
            <TransactionsTable
              variant="embedded"
              embeddedMaxRows={5}
              transactions={filteredTransactions}
              isLoading={isLoading}
              onTransactionSelect={handleTransactionSelect}
              hiddenColumns={["category"]}
              emptyMessage={
                transactions.length === 0 ? "Activate your card" : undefined
              }
            />
          </WidgetCard>
        </div>
      </div>

      <TransactionDetailModal
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
        tx={selectedTransaction}
      />
    </div>
  );
}
