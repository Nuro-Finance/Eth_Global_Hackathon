"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconPalette, IconCheck, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useThemeColor } from "./ThemeColorProvider";
import { cn } from "@/lib/utils";

const SCROLL_TOP_KEY = "theme-scroll-top";
const STORAGE_KEY = "template-theme-color";

export function ThemeColorSwitcher() {
  const t = useTranslations("ThemeColorSwitcher");
  const { currentTheme, themes } = useThemeColor();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll to top after page reload from theme change
  useEffect(() => {
    if (sessionStorage.getItem(SCROLL_TOP_KEY)) {
      sessionStorage.removeItem(SCROLL_TOP_KEY);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);

  // Handle theme change - save to localStorage and reload immediately
  const handleThemeChange = (themeId: string) => {
    if (themeId !== currentTheme.id) {
      // Save to localStorage first (don't apply theme visually)
      localStorage.setItem(STORAGE_KEY, themeId);
      // Set flag to scroll to top after reload
      sessionStorage.setItem(SCROLL_TOP_KEY, "true");
      // Reload page immediately - theme will be applied by ThemeScript on load
      window.location.reload();
    }
  };

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={panelRef} className="fixed bottom-6 end-6 z-100">
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center",
          "bg-[var(--color-brand-surface)]/90 backdrop-blur-md border border-[var(--color-brand-border)]/50",
          "shadow-lg shadow-[var(--color-brand-glow)]/20",
          "hover:bg-[var(--color-brand-surface)] hover:border-[var(--color-brand-primary)]/50",
          "transition-all duration-300",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/50"
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={t("changeTheme")}
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {isOpen ? (
            <IconX className="w-5 h-5 text-[var(--color-brand-primary-light)]" />
          ) : (
            <IconPalette className="w-5 h-5 text-[var(--color-brand-primary-light)]" />
          )}
        </motion.div>
      </motion.button>

      {/* Color Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "absolute bottom-16 end-0",
              "w-64 p-4 rounded-xl",
              "bg-[var(--color-bg-card)]/95 backdrop-blur-xl",
              "border border-[var(--color-border-secondary)]/50",
              "shadow-2xl shadow-black/30"
            )}
          >
            {/* Header */}
            <div className="mb-4">
              <h3 className="text-[var(--color-text-primary)] font-medium text-sm font-dm-sans">
                {t("title")}
              </h3>
              <p className="text-[var(--color-text-muted)] text-xs mt-1">
                {t("description")}
              </p>
            </div>

            {/* Color Grid */}
            <div className="grid grid-cols-4 gap-2">
              {themes.map((theme) => (
                <motion.button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={cn(
                    "relative w-12 h-12 rounded-lg",
                    "flex items-center justify-center",
                    "border-2 transition-all duration-200",
                    "focus:outline-none",
                    currentTheme.id === theme.id
                      ? "border-white/80 scale-105"
                      : "border-transparent hover:border-white/30"
                  )}
                  style={{ backgroundColor: theme.preview }}
                  whileHover={{
                    scale: currentTheme.id === theme.id ? 1.05 : 1.1,
                  }}
                  whileTap={{ scale: 0.95 }}
                  title={theme.name}
                  aria-label={t("selectTheme", { theme: theme.name })}
                >
                  {currentTheme.id === theme.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg"
                    >
                      <IconCheck className="w-5 h-5 text-white drop-shadow-md" />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Current Theme Name */}
            <div className="mt-4 pt-3 border-t border-[var(--color-border-secondary)]/50">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)] text-xs">
                  {t("current")}:
                </span>
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: `${currentTheme.preview}20`,
                    color: currentTheme.preview,
                  }}
                >
                  {currentTheme.name}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="mt-3 p-2 rounded-lg bg-[var(--color-brand-surface)]/30 border border-[var(--color-brand-border)]/30">
              <p className="text-[var(--color-text-muted)] text-[10px] leading-relaxed">
                ⚠️ {t("demoWarning")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
