"use client";

import { useEffect, useState } from "react";

/**
 * Hook to get theme-aware text color for chart axes
 */
export function useThemeTextColor() {
    const [textColor, setTextColor] = useState("var(--color-text-muted)");

    useEffect(() => {
        const updateTextColor = () => {
            const rootStyles = getComputedStyle(document.documentElement);
            const mutedColor = rootStyles
                .getPropertyValue("--color-text-muted")
                .trim();
            setTextColor(mutedColor || "var(--color-text-muted)");
        };

        updateTextColor();

        // Listen for theme changes
        const observer = new MutationObserver(updateTextColor);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    return textColor;
}
