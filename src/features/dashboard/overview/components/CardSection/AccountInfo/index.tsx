"use client";

import { useMemo } from "react";
import { AccountHeader, BalanceDisplay, ActionButtons } from "./components";
import { MOCK_CARDS } from "@/config/mock-data";
import {
  useAccountBalance,
  getDesignMockCardFrontOverlay,
} from "./hooks/useAccountBalance";
import { cn } from "@/lib/utils";
import type { CardSectionLayout } from "../types";

interface AccountInfoProps {
  onAddCard?: () => void;
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
  cardName?: string;
  cardColor?: string;
  onReloadClick?: () => void;
  onWithdrawClick?: () => void;
  layout?: CardSectionLayout;
 /** md1 squish: summary = title+balance only; actions = button row under card+numbers */
  squishPart?: "summary" | "actions";
 /** NuroCodeCard: show active card balance, not wallet total. */
  usePerCardBalance?: boolean;
  activeCardId?: string;
}

export default function AccountInfo({
  onAddCard,
  isFrozen,
  onToggleFreeze,
  cardName,
  cardColor,
  onReloadClick,
  onWithdrawClick,
  layout = "standard",
  squishPart,
  usePerCardBalance = false,
  activeCardId,
}: AccountInfoProps) {
  const { balance: walletBalance, cards: accountCards } = useAccountBalance();
  const balance = useMemo(() => {
    if (!usePerCardBalance) return walletBalance;
    const resolvedId = activeCardId ?? accountCards[0]?.id ?? "c1";
    const mockOverlay =
      getDesignMockCardFrontOverlay(resolvedId) ??
      getDesignMockCardFrontOverlay(accountCards[0]?.id ?? "c1");
    const accountCard =
      accountCards.find((c) => c.id === resolvedId) ?? accountCards[0];
    const mockRow =
      MOCK_CARDS.find((c) => c.id === resolvedId) ?? MOCK_CARDS[0];
    return (
      mockOverlay?.balance ??
      accountCard?.balance ??
      (typeof mockRow?.balance === "number" ? mockRow.balance : walletBalance)
    );
  }, [usePerCardBalance, activeCardId, accountCards, walletBalance]);

  const isSquish = layout === "squish";

  if (isSquish && squishPart === "actions") {
    return (
      <ActionButtons
        isFrozen={isFrozen}
        onToggleFreeze={onToggleFreeze}
        cardColor={cardColor}
        onReloadClick={onReloadClick}
        onWithdrawClick={onWithdrawClick}
        layout={layout}
      />
    );
  }

  if (isSquish && squishPart === "summary") {
    return (
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <AccountHeader
          onAddCard={onAddCard}
          cardName={cardName}
          isFrozen={isFrozen}
          layout={layout}
        />
        <BalanceDisplay balance={balance} layout={layout} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        isSquish ? "min-w-0 flex-1" : "flex-1 lg:w-auto lg:min-w-[280px]",
      )}
    >
      <AccountHeader
        onAddCard={onAddCard}
        cardName={cardName}
        isFrozen={isFrozen}
        layout={layout}
      />
      <BalanceDisplay balance={balance} layout={layout} />
      <ActionButtons
        isFrozen={isFrozen}
        onToggleFreeze={onToggleFreeze}
        cardColor={cardColor}
        onReloadClick={onReloadClick}
        onWithdrawClick={onWithdrawClick}
        layout={layout}
      />
    </div>
  );
}
