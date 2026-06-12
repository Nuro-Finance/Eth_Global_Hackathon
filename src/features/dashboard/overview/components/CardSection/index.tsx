"use client";

import { Crown } from "lucide-react";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeContext";
import CardStack from "./CardStack";
import AccountInfo from "./AccountInfo";
import {
  initialCardsData,
  generateDemoCard,
  CardData,
} from "./CardStack/config/cardStack.config";
import {
  isNoirCardSkinGradient,
  isWhiteCardSkinGradient,
  MY_CARD_WHITE_BLOB_GRADIENT,
} from "@/lib/cardSkins";
import { GradientCrossfadeLayers } from "@/components/GradientCrossfadeLayers";
import { useCardsState } from "@/features/dashboard/cards/layouts/CardsGrid/hooks/useCardsState";
import ReloadModal from "@/features/dashboard/my-card-v2/ReloadModal";
import WithdrawModal from "./WithdrawModal";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";

const DEFAULT_CTA_BLOB_BG =
  "linear-gradient(60deg, var(--color-primary) 0%, var(--color-accent) 100%)";

function resolveBlobBackground(cardColor: string | undefined): string {
  if (isNoirCardSkinGradient(cardColor)) {
    return DEFAULT_CTA_BLOB_BG;
  }
  if (isWhiteCardSkinGradient(cardColor ?? "")) {
    return MY_CARD_WHITE_BLOB_GRADIENT;
  }
  return cardColor!.trim();
}

import type { CardSectionLayout } from "./types";
export type { CardSectionLayout } from "./types";

interface CardSectionProps {
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
  cardName?: string;
  cardColor?: string;
  onReloadClick?: () => void;
  onWithdrawClick?: () => void;
  /** Set by page tier slot — not viewport JS. */
  layout?: CardSectionLayout;
  /** Responsive home: SVG NuroCodeCard face instead of CreditCard. */
  useNuroCodeCard?: boolean;
}

const FREEZE_EASE = [0.22, 1, 0.36, 1] as const;

const CORAL_FROZEN_SHADOW =
  [
    "0 0 16px rgba(255, 82, 82, 0.24)",
    "0 0 36px rgba(255, 82, 82, 0.1)",
    "inset 0 0 32px 0 rgba(255, 82, 82, 0.38)",
    "inset 0 0 56px 0 rgba(255, 82, 82, 0.1)",
    "inset 0 1px 0 0 rgba(255, 140, 140, 0.16)",
    "inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)",
  ].join(", ");

const GLASS_CARD_INNER_SHADOW_DARK = "inset 0 -1px 0 0 rgba(0, 0, 0, 0.12)";

const CARD_RADIUS_OUTER = "rounded-[24px]";
const CARD_RADIUS_INNER = "rounded-[23px]";

export default function CardSection({
  isFrozen,
  onToggleFreeze,
  cardName,
  cardColor,
  onReloadClick,
  onWithdrawClick,
  layout = "standard",
  useNuroCodeCard = false,
}: CardSectionProps) {
  const isSquish = layout === "squish";
  const { resolvedTheme } = useTheme();
  const [reloadOpen, setReloadOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [demoCards, setDemoCards] = useState(initialCardsData);
  const [activeCardId, setActiveCardId] = useState<string | undefined>();

  // Real API cards
  const { cards: apiCards, handleAddCard: apiHandleAddCard } = useCardsState();

  const handleAddCard = useCallback(() => {
    if (apiCards.length > 0) {
      apiHandleAddCard();
    } else {
      setDemoCards((prev) => [generateDemoCard(prev.length), ...prev]);
    }
  }, [apiCards.length, apiHandleAddCard]);

  const handleUpgradeClick = useCallback(() => {
    setUpgradeOpen(true);
  }, []);

  // Map API cards to CardData format for the stack
  const displayCards: CardData[] = apiCards.length > 0
    ? apiCards.map((c) => ({
      id: c.cardType === "VIRA" ? "VISA" : (c.cardType || "VISA"),
      cardNumber: c.cardNumber,
      cardHolder: c.cardName || c.cardHolder,
      expiryDate: c.expiryDate,
      gradient: c.gradient || "linear-gradient(60deg, #151333 30%, var(--color-primary) 70%, var(--color-accent) 100%)",
      isGlass: false,
    }))
    : [{
      id: "VISA",
      cardNumber: "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022",
      cardHolder: "No cards yet",
      expiryDate: "--/--",
      gradient: "linear-gradient(135deg, #1a1a1a 0%, #333333 100%)",
      isGlass: false,
    }];

  const unfrozenPanelShadow =
    resolvedTheme === "dark" ? GLASS_CARD_INNER_SHADOW_DARK : "none";

  const themePurpleOut = {
    duration: isFrozen ? 0.52 : 0.44,
    ease: FREEZE_EASE,
    delay: isFrozen ? 0 : 0.06,
  };

  const blobBackground = resolveBlobBackground(cardColor);
  const blobOpacityUnfrozen = 0.6;

  const handleReceive = onReloadClick ?? (() => setReloadOpen(true));
  const handleWithdraw = onWithdrawClick ?? (() => setWithdrawOpen(true));

  return (
    <>
      <motion.div
        className={cn(
          "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner !border-none relative",
          CARD_RADIUS_OUTER,
          "transition-[border-color] duration-[520ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
        )}
        style={{ transformStyle: "preserve-3d", boxShadow: unfrozenPanelShadow }}
        initial={false}
      >
        <motion.div
          className={cn(
            "pointer-events-none absolute inset-0 z-[1] overflow-hidden",
            CARD_RADIUS_OUTER,
          )}
          aria-hidden
          initial={false}
          animate={{ opacity: isFrozen ? 1 : 0 }}
          transition={{
            opacity: {
              duration: isFrozen ? 0.56 : 0.42,
              ease: FREEZE_EASE,
              delay: isFrozen ? 0.07 : 0.06,
            },
          }}
          style={{ boxShadow: CORAL_FROZEN_SHADOW }}
        />
        <div
          className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden [transform:translateZ(0)]", CARD_RADIUS_INNER)}
          aria-hidden
        >
          <motion.div
            className="absolute pointer-events-none -rotate-20 rtl:rotate-20"
            style={{
              insetBlockStart: "-140px",
              insetInlineEnd: "-110px",
              inlineSize: "570px",
              blockSize: "260px",
              borderRadius: "50%",
              filter: "blur(70px)",
            }}
            initial={false}
            animate={{ opacity: isFrozen ? 0 : blobOpacityUnfrozen }}
            transition={themePurpleOut}
          >
            <GradientCrossfadeLayers
              gradient={blobBackground}
              style={{ borderRadius: "50%" }}
            />
          </motion.div>
        </div>

        <div
          className={cn(
            "relative z-10 flex h-auto overflow-hidden [transform:translateZ(0)]",
            isSquish
              ? "flex-col gap-4 p-8"
              : "flex-col gap-4 p-6 md:h-[250px] md:flex-row md:items-center md:justify-between md:gap-10",
            CARD_RADIUS_INNER,
          )}
        >
          <div className="absolute top-4 right-4 md:hidden z-[100]">
            <button
              onClick={handleUpgradeClick}
              className={cn(
                "text-[12px] font-bold rounded-[10px] px-4 h-7 bg-white/[0.1] text-[var(--color-text-primary)] hover:bg-white/[0.12] transition-all flex items-center gap-2 font-[inherit]"
              )}
            >
              <Crown className="w-3.5 h-3.5" strokeWidth={2} />
              Upgrade
            </button>
          </div>


          {isSquish ? (
            <>
              <div className="flex w-full min-w-0 items-center gap-5">
                <div className="flex w-[172px] shrink-0 items-center justify-center">
                  <CardStack
                    cards={displayCards}
                    cardColor={cardColor}
                    isFrozen={isFrozen}
                    layout={layout}
                    useNuroCodeCard={useNuroCodeCard}
                    onActiveCardIdChange={useNuroCodeCard ? setActiveCardId : undefined}
                  />
                </div>
                <AccountInfo
                  onAddCard={handleUpgradeClick}
                  isFrozen={isFrozen}
                  onToggleFreeze={onToggleFreeze}
                  cardName={cardName}
                  cardColor={cardColor}
                  onReloadClick={handleReceive}
                  onWithdrawClick={handleWithdraw}
                  layout={layout}
                  squishPart="summary"
                  usePerCardBalance={useNuroCodeCard}
                  activeCardId={activeCardId}
                />
              </div>
              <AccountInfo
                onAddCard={handleUpgradeClick}
                isFrozen={isFrozen}
                onToggleFreeze={onToggleFreeze}
                cardName={cardName}
                cardColor={cardColor}
                onReloadClick={handleReceive}
                onWithdrawClick={handleWithdraw}
                layout={layout}
                squishPart="actions"
              />
            </>
          ) : (
            <>
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center",
                  useNuroCodeCard && "overflow-visible",
                )}
              >
                <CardStack
                  cards={displayCards}
                  cardColor={cardColor}
                  isFrozen={isFrozen}
                  layout={layout}
                  useNuroCodeCard={useNuroCodeCard}
                  onActiveCardIdChange={useNuroCodeCard ? setActiveCardId : undefined}
                />
              </div>
              <AccountInfo
                onAddCard={handleUpgradeClick}
                isFrozen={isFrozen}
                onToggleFreeze={onToggleFreeze}
                cardName={cardName}
                cardColor={cardColor}
                onReloadClick={handleReceive}
                onWithdrawClick={handleWithdraw}
                layout={layout}
                usePerCardBalance={useNuroCodeCard}
                activeCardId={activeCardId}
              />
            </>
          )}
        </div>
      </motion.div>

      <ReloadModal open={reloadOpen} onClose={() => setReloadOpen(false)} />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}

