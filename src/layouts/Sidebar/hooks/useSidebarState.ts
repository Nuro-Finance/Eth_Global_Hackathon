"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { SIDEBAR_WIDTH } from "../config/sidebar.config";

interface UseSidebarStateProps {
    onMobileMenuClose?: () => void;
}

interface UseSidebarStateReturn {
    collapsed: boolean;
    toggleCollapsed: () => void;
    locale: string;
    isRTL: boolean;
    pathname: string;
}

export function useSidebarState({
    onMobileMenuClose,
}: UseSidebarStateProps = {}): UseSidebarStateReturn {
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();
    const locale = pathname.split("/")[1] || "en";
    const isRTL = locale === "ar";

    // Track previous pathname to detect actual navigation
    const prevPathnameRef = useRef(pathname);

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => !prev);
    }, []);

    // Listen for global toggle events from header hamburger
    useEffect(() => {
        const handleToggle = () => {
            setCollapsed((prev) => !prev);
        };

        window.addEventListener("sidebar-toggle", handleToggle);
        return () => {
            window.removeEventListener("sidebar-toggle", handleToggle);
        };
    }, []);

    // Close mobile menu only when pathname actually changes (not on initial mount)
    useEffect(() => {
        if (prevPathnameRef.current !== pathname) {
            prevPathnameRef.current = pathname;
            onMobileMenuClose?.();
        }
    }, [pathname, onMobileMenuClose]);

    // Update CSS custom property when collapsed state changes
    useEffect(() => {
        const sidebarWidth = collapsed
            ? SIDEBAR_WIDTH.COLLAPSED
            : SIDEBAR_WIDTH.EXPANDED;
        document.documentElement.style.setProperty("--sidebar-width", sidebarWidth);

        return () => {
            document.documentElement.style.removeProperty("--sidebar-width");
        };
    }, [collapsed]);

    return {
        collapsed,
        toggleCollapsed,
        locale,
        isRTL,
        pathname,
    };
}
