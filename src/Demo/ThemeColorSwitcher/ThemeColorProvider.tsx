"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { ThemeColors, themes } from "./themes";

interface ThemeContextType {
  currentTheme: ThemeColors;
  setTheme: (themeId: string) => void;
  themes: ThemeColors[];
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "template-theme-color";

export function useThemeColor() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeColor must be used within a ThemeColorProvider");
  }
  return context;
}

// Inline script to apply theme before React hydrates (prevents flash)
function ThemeScript({ defaultTheme }: { defaultTheme: string }) {
  const themeMap = themes.reduce((acc, theme) => {
    acc[theme.id] = theme;
    return acc;
  }, {} as Record<string, ThemeColors>);

  const scriptContent = `
    (function() {
      try {
        var themes = ${JSON.stringify(themeMap)};
        var savedThemeId = localStorage.getItem('${STORAGE_KEY}') || '${defaultTheme}';
        var theme = themes[savedThemeId] || themes['${defaultTheme}'];
        if (theme) {
          var root = document.documentElement;
 // Brand Image Filters
          root.style.setProperty('--brand-hue-rotate', theme.brandHueRotate);
          root.style.setProperty('--brand-saturate', theme.brandSaturate);
          root.style.setProperty('--brand-brightness', theme.brandBrightness);
 // Brand/Primary Colors (these change with theme)
          root.style.setProperty('--color-primary', theme.brandPrimary);
          root.style.setProperty('--color-primary-light', theme.brandPrimaryLight);
          root.style.setProperty('--color-brand-primary', theme.brandPrimary);
          root.style.setProperty('--color-brand-primary-light', theme.brandPrimaryLight);
          root.style.setProperty('--color-brand-surface', theme.brandSurface);
          root.style.setProperty('--color-brand-border', theme.brandBorder);
          root.style.setProperty('--color-brand-glow', theme.brandGlow);
          root.style.setProperty('--color-nuro-brand', theme.nuroBrand);
          root.style.setProperty('--color-accent', theme.accent);
          root.style.setProperty('--color-button-text', theme.buttonText);
 // Card accent colors (brand-related)
          root.style.setProperty('--color-card-accent', theme.cardAccent);
          root.style.setProperty('--color-card-accent-muted', theme.cardAccentMuted);
        }
      } catch (e) {}
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}

function applyTheme(theme: ThemeColors) {
  const root = document.documentElement;

 // Brand Image Filters
  root.style.setProperty("--brand-hue-rotate", theme.brandHueRotate);
  root.style.setProperty("--brand-saturate", theme.brandSaturate);
  root.style.setProperty("--brand-brightness", theme.brandBrightness);

 // Brand/Primary Colors (these change with theme, UI colors come from CSS)
  root.style.setProperty("--color-primary", theme.brandPrimary);
  root.style.setProperty("--color-primary-light", theme.brandPrimaryLight);
  root.style.setProperty("--color-brand-primary", theme.brandPrimary);
  root.style.setProperty(
    "--color-brand-primary-light",
    theme.brandPrimaryLight
  );
  root.style.setProperty("--color-brand-surface", theme.brandSurface);
  root.style.setProperty("--color-brand-border", theme.brandBorder);
  root.style.setProperty("--color-brand-glow", theme.brandGlow);
  root.style.setProperty("--color-nuro-brand", theme.nuroBrand);
  root.style.setProperty("--color-accent", theme.accent);

 // Button Colors
  root.style.setProperty("--color-button-text", theme.buttonText);

 // Card accent colors (brand-related)
  root.style.setProperty("--color-card-accent", theme.cardAccent);
  root.style.setProperty("--color-card-accent-muted", theme.cardAccentMuted);
}

interface ThemeColorProviderProps {
  children: ReactNode;
  defaultTheme?: string;
}

export function ThemeColorProvider({
  children,
  defaultTheme = "blue",
}: ThemeColorProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<ThemeColors>(
    () => themes.find((t) => t.id === defaultTheme) || themes[0]
  );
  const [mounted, setMounted] = useState(false);

 // Load saved theme on mount
  useEffect(() => {
    const savedThemeId = localStorage.getItem(STORAGE_KEY);
    if (savedThemeId) {
      const savedTheme = themes.find((t) => t.id === savedThemeId);
      if (savedTheme) {
        setCurrentTheme(savedTheme);
        applyTheme(savedTheme);
      }
    } else {
      applyTheme(currentTheme);
    }
    setMounted(true);
  }, []);

 // Apply theme when it changes
  useEffect(() => {
    if (mounted) {
      applyTheme(currentTheme);
      localStorage.setItem(STORAGE_KEY, currentTheme.id);
    }
  }, [currentTheme, mounted]);

  const setTheme = (themeId: string) => {
    const theme = themes.find((t) => t.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
 // Save to localStorage - page will reload via ThemeColorSwitcher
      localStorage.setItem(STORAGE_KEY, theme.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      <ThemeScript defaultTheme={defaultTheme} />
      {children}
    </ThemeContext.Provider>
  );
}
