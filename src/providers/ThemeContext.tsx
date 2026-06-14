"use client";

import {
  createContext,
  useContext,
  useEffect,
  ReactNode,
} from "react";

// 2026-06-01: theme system hard-locked to dark only.
// The setTheme function is a no-op kept for API compatibility with settings UI.
// The HTML root always carries the `dark` class regardless of localStorage.

type Theme = "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("light", "graphite");
    html.classList.add("dark");
    try {
      localStorage.setItem("theme", "dark");
    } catch {
 /* private mode / quota - silent */
    }
  }, []);

  const value: ThemeContextType = {
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: () => {
 /* no-op: theme is locked to dark */
    },
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
