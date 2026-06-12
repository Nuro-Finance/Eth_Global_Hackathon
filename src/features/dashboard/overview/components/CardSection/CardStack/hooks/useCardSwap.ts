"use client";

import { useState, useCallback } from "react";
import { animationConfig } from "../config/cardStack.config";

/**
 * Hook for managing card stack swap animation
 */
export function useCardSwap(totalCards: number) {
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    const handleCardSwap = useCallback(() => {
        if (isAnimating) return;
        setIsAnimating(true);

        setTimeout(() => {
            setActiveCardIndex((prev) => (prev + 1) % totalCards);
            setTimeout(() => setIsAnimating(false), animationConfig.resetDelay);
        }, animationConfig.swapDelay);
    }, [isAnimating, totalCards]);

    return {
        activeCardIndex,
        isAnimating,
        handleCardSwap,
    };
}
