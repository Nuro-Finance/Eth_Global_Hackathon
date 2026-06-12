"use client";

import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { CreditCard } from "@/components";
import { NuroCodeCard } from "@/components/NuroCodeCard";
import { MOCK_CARDS } from "@/config/mock-data";
import {
  useAccountBalance,
  getDesignMockCardFrontOverlay,
} from "../AccountInfo/hooks/useAccountBalance";
import { useCardSwap, useCardPositions } from "./hooks";
import { CardData } from "./config/cardStack.config";
import type { CardSectionLayout } from "../types";

interface CardStackProps {
  cards: CardData[];
  cardColor?: string;
  isFrozen?: boolean;
  layout?: CardSectionLayout;
  useNuroCodeCard?: boolean;
  onActiveCardIdChange?: (cardId: string) => void;
}

export default function CardStack({
  cards,
  cardColor,
  isFrozen,
  layout = "standard",
  useNuroCodeCard = false,
  onActiveCardIdChange,
}: CardStackProps) {
  const isSquish = layout === "squish";
  const isFlat = layout === "flat";
  const [narrowViewport, setNarrowViewport] = useState(false);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const locale = useLocale();
  const isRtl = locale === "ar";
  const totalCards = cards.length;
 /** Tilt only on standard (md3/xl). md1 squish + md2 flat stay square. */
  const flatCard = isSquish || isFlat || narrowViewport;

  const {
    balance: accountBalance,
    primarySensitive,
    cards: accountCards,
    isOverlayLoading,
  } = useAccountBalance();

  useEffect(() => {
    const check = () => setNarrowViewport(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { activeCardIndex, isAnimating, handleCardSwap } =
    useCardSwap(totalCards);
  const { getCardPosition, cardVariants } = useCardPositions(isRtl, totalCards, flatCard);

  const getStackIndex = (cardIndex: number): number => {
    const diff = cardIndex - activeCardIndex;
    if (diff >= 0) return diff;
    return totalCards + diff;
  };

  const sortedCards = [...cards]
    .map((card, index) => ({ card, originalIndex: index }))
    .sort(
      (a, b) => getStackIndex(b.originalIndex) - getStackIndex(a.originalIndex),
    );

  const frontCard = cards[activeCardIndex] ?? cards[0];
  const nuroFace = useMemo(() => {
    if (!frontCard) return null;
    const mockOverlay =
      getDesignMockCardFrontOverlay(frontCard.id) ??
      getDesignMockCardFrontOverlay(accountCards[0]?.id ?? "c1");
    const accountCard =
      accountCards.find((c) => c.id === frontCard.id) ?? accountCards[0];
    const mockRow =
      MOCK_CARDS.find((c) => c.id === frontCard.id) ?? MOCK_CARDS[0];
    const sensitive = mockOverlay?.sensitive ?? primarySensitive;
    const panMasked = sensitive?.panMasked ?? "•••• •••• •••• ----";
    const panDisplay = sensitiveRevealed
      ? sensitive?.panRevealed ?? panMasked
      : panMasked;

    return {
      balance: mockOverlay?.balance ?? accountCard?.balance ?? accountBalance,
      panMasked: panDisplay,
      expiry: sensitive?.expiry ?? frontCard.expiryDate ?? "—/—",
      cvv: sensitive?.cvv ?? "•••",
      cardHolderName: frontCard.cardHolder,
      cardName:
        accountCard?.name ??
        (mockRow as { cardName?: string } | undefined)?.cardName ??
        "",
    };
  }, [
    frontCard,
    accountCards,
    accountBalance,
    primarySensitive,
    sensitiveRevealed,
  ]);

  useEffect(() => {
    setSensitiveRevealed(false);
  }, [frontCard?.id]);

  useEffect(() => {
    if (frontCard?.id) onActiveCardIdChange?.(frontCard.id);
  }, [frontCard?.id, onActiveCardIdChange]);

  return (
    <div
      className={cn(
        "relative z-10 flex w-full perspective-[1000px]",
        isSquish
          ? "mb-0 mt-0 h-[108px] w-[172px] shrink-0 items-center justify-center"
          : "mb-2 flex items-center justify-center sm:-mt-8 sm:h-[240px] md:mt-0 md:mb-0 md:h-auto",
      )}
    >
      <div
        className={cn(
          "relative mx-auto shrink-0",
          isSquish
            ? "h-[108px] w-[172px]"
            : "h-[164px] w-[260px] sm:h-[189px] sm:w-[300px] md:mx-0 md:h-[151px] md:w-[240px] xl:h-[176px] xl:w-[280px] 2xl:h-[202px] 2xl:w-[320px]",
        )}
        style={{
          perspective: "1000px",
          transformStyle: "preserve-3d",
          willChange: "transform",
          transform: "translate3d(0, 0, 0)",
        }}
      >
        <AnimatePresence mode="sync">
          {sortedCards.map(({ card, originalIndex }) => {
            const stackIndex = getStackIndex(originalIndex);
            const isFront = stackIndex === 0;
            const position = getCardPosition(stackIndex);

            if (!isFront) return null;

            if (useNuroCodeCard && nuroFace) {
              const animationZIndex = isAnimating && isFront ? 100 : position.zIndex;

              return (
                <motion.div
                  key={card.id}
                  className={cn(
                    "relative h-full w-full",
                    isFrozen ? "cursor-default" : "cursor-pointer",
                  )}
                  variants={cardVariants}
                  initial={false}
                  animate={
                    isAnimating && isFront
                      ? "exitUp"
                      : {
                          x: position.x,
                          y: position.y,
                          rotateZ: position.rotateZ,
                          scale: position.scale,
                          opacity: position.opacity,
                          transition: {
                            duration: isAnimating ? 0.5 : 0,
                            ease: [0.32, 0.7, 0, 1],
                          },
                        }
                  }
                  style={{
                    transformOrigin: "center center",
                    zIndex: animationZIndex,
                    willChange: "transform",
                  }}
                  onClick={isFront && !isAnimating && !isFrozen ? handleCardSwap : undefined}
                >
                  <NuroCodeCard
                    balance={nuroFace.balance}
                    panMasked={nuroFace.panMasked}
                    expiry={nuroFace.expiry}
                    cvv={nuroFace.cvv}
                    sensitiveRevealed={sensitiveRevealed}
                    onToggleSensitive={() => setSensitiveRevealed((x) => !x)}
                    cardHolderName={nuroFace.cardHolderName}
                    cardName={nuroFace.cardName}
                    isLoading={isOverlayLoading}
                    hideDetails
                  />
                </motion.div>
              );
            }

            return (
              <CreditCard
                key={card.id}
                {...card}
                gradient={cardColor || card.gradient}
                animated
                isFront={isFront}
                isAnimating={isAnimating}
                cardVariants={cardVariants}
                cardPosition={position}
                isRtl={isRtl}
                onSwap={handleCardSwap}
                isFrozen={isFrozen}
                className={isSquish ? "!h-[108px] !w-[172px]" : undefined}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
