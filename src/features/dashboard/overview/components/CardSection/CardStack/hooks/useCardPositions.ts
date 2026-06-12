"use client";

import { useMemo, useCallback } from "react";
import { Variants } from "framer-motion";

interface CardPositions {
    getCardPosition: (stackIndex: number) => {
        x: number;
        y: number;
        z: number;
        rotateX: number;
        rotateY: number;
        rotateZ: number;
        scale: number;
        zIndex: number;
        opacity: number;
    };
    cardVariants: Variants;
}

/**
 * Hook for calculating card positions based on RTL/LTR direction
 * Supports unlimited number of cards with consistent animation
 */
/** @param flatCard When true, front card has no desktop tilt (squish layout or &lt;768 viewport). */
export function useCardPositions(isRtl: boolean, totalCards: number = 2, flatCard: boolean = false): CardPositions {
    const getCardPosition = useCallback((stackIndex: number) => {
        // Front card (stackIndex = 0) — slight desktop tilt (5.4.26 parity)
        if (stackIndex === 0) {
            return {
                x: flatCard ? 0 : (isRtl ? -10 : 10),
                y: 0,
                z: 0,
                rotateX: 0,
                rotateY: 0,
                rotateZ: flatCard ? 0 : (isRtl ? 5 : -5),
                scale: 1,
                zIndex: totalCards + 10,
                opacity: 1,
            };
        }

        // Back card (stackIndex = 1) - same position for all back cards
        return {
            x: isRtl ? -15 : 15,
            y: 10,
            z: 0,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            scale: 1,
            zIndex: totalCards - stackIndex,
            opacity: 1,
        };
    }, [isRtl, totalCards, flatCard]);

    const cardVariants = useMemo((): Variants => ({
        exitUp: {
            x: isRtl ? -10 : 10,
            y: -15,
            z: 2,
            rotateX: 20,
            rotateY: 0,
            rotateZ: flatCard ? 0 : (isRtl ? 5 : -5),
            scale: 1,
            opacity: 1,
            transition: {
                duration: 0.5,
                ease: [0.32, 0.7, 0, 1],
            },
        },
        exitDown: {
            x: isRtl ? -20 : 20,
            y: 20,
            z: 0,
            rotateX: 20,
            rotateY: 0,
            rotateZ: flatCard ? 0 : (isRtl ? -5 : 5),
            scale: 1,
            opacity: 1,
            transition: {
                duration: 0.5,
                ease: [0.32, 0.7, 0, 1],
            },
        },
    }), [isRtl, flatCard]);

    return { getCardPosition, cardVariants };
}
