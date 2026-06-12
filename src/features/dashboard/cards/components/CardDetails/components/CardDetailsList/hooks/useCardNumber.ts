"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Hook for managing card number visibility and copy functionality
 */
export function useCardNumber(cardNumber: string) {
    const [showCardNumber, setShowCardNumber] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const toggleVisibility = useCallback(() => {
        setShowCardNumber((prev) => !prev);
    }, []);

    const copyToClipboard = useCallback(() => {
        navigator.clipboard.writeText(cardNumber);
        setIsCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setIsCopied(false), 2000);
    }, [cardNumber]);

    const maskedNumber = `•••• •••• •••• ${cardNumber.slice(-4)}`;
    const displayNumber = showCardNumber ? cardNumber : maskedNumber;

    return {
        showCardNumber,
        toggleVisibility,
        copyToClipboard,
        displayNumber,
        isCopied,
    };
}
