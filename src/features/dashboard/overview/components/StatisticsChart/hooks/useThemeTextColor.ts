"use client";

import { useState, useEffect } from "react";

/**
 * Hook to get and track theme-aware text color
 */
export function useThemeTextColor(defaultColor = "var(--color-text-muted)") {
    const [textColor, setTextColor] = useState(defaultColor);

    useEffect(() => {
        const updateTextColor = () => {
            const rootStyles = getComputedStyle(document.documentElement);
            const mutedColor = rootStyles
                .getPropertyValue("--color-text-muted")
                .trim();
            setTextColor(mutedColor || defaultColor);
        };

        updateTextColor();

 // Listen for theme changes
        const observer = new MutationObserver(updateTextColor);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, [defaultColor]);

    return textColor;
}
