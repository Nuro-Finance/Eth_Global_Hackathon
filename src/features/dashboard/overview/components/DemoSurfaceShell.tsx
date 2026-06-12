"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  DEV_NEW_USER_PREVIEW_EVENT,
  readDevNewUserPreviewEnabled,
  useDemoSurfaceState,
} from "../hooks/designSampleData";

type DemoSurfaceContextValue = {
  groupHovered: boolean;
  registerRegionEnter: () => void;
  registerRegionLeave: () => void;
  demoActive: boolean;
  exploring: boolean;
  exploreDemo: () => void;
  clearDemoData: () => void;
};

const DemoSurfaceContext = createContext<DemoSurfaceContextValue | null>(null);

function useDemoSurfaceContext() {
  const ctx = useContext(DemoSurfaceContext);
  if (!ctx) {
    throw new Error("DemoSurfaceRegion must be used within DemoSurfaceRoot");
  }
  return ctx;
}

/** Shared hover + demo state for non-contiguous regions (cash flow + transactions). */
export function DemoSurfaceRoot({ children }: { children: ReactNode }) {
  const { demoActive, exploring, exploreDemo, clearDemoData } = useDemoSurfaceState();
  const [groupHovered, setGroupHovered] = useState(false);
  const hoverDepthRef = useRef(0);

  const registerRegionEnter = useCallback(() => {
    hoverDepthRef.current += 1;
    setGroupHovered(true);
  }, []);

  const registerRegionLeave = useCallback(() => {
    hoverDepthRef.current = Math.max(0, hoverDepthRef.current - 1);
    if (hoverDepthRef.current === 0) {
      setGroupHovered(false);
    }
  }, []);

  useEffect(() => {
    const resetHover = () => {
      hoverDepthRef.current = 0;
      setGroupHovered(false);
    };
    window.addEventListener(DEV_NEW_USER_PREVIEW_EVENT, resetHover);
    return () => window.removeEventListener(DEV_NEW_USER_PREVIEW_EVENT, resetHover);
  }, []);

  const value: DemoSurfaceContextValue = {
    groupHovered,
    registerRegionEnter,
    registerRegionLeave,
    demoActive,
    exploring,
    exploreDemo,
    clearDemoData,
  };

  return <DemoSurfaceContext.Provider value={value}>{children}</DemoSurfaceContext.Provider>;
}

type DemoSurfaceRegionProps = {
  children: ReactNode;
  className?: string;
  /** When true, action buttons render in this region while it is hovered. */
  showActions?: boolean;
};

export function DemoSurfaceRegion({
  children,
  className,
  showActions = false,
}: DemoSurfaceRegionProps) {
  const t = useTranslations("Dashboard");
  const { registerRegionEnter, registerRegionLeave, demoActive, exploring, exploreDemo, clearDemoData } =
    useDemoSurfaceContext();
  const [localHovered, setLocalHovered] = useState(false);

  /** Switch ON: blur + Explore/Clear only while this region is hovered. Switch OFF: no overlay. */
  const blocked = readDevNewUserPreviewEnabled() && demoActive && !exploring;
  const showDemoOverlay = blocked && localHovered;

  useEffect(() => {
    if (!blocked) setLocalHovered(false);
  }, [blocked]);

  const onEnter = useCallback(() => {
    setLocalHovered(true);
    registerRegionEnter();
  }, [registerRegionEnter]);

  const onLeave = useCallback(() => {
    setLocalHovered(false);
    registerRegionLeave();
  }, [registerRegionLeave]);

  return (
    <div
      className={cn("relative min-w-0", className)}
      onMouseEnter={blocked ? onEnter : undefined}
      onMouseLeave={blocked ? onLeave : undefined}
    >
      <div
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col",
          showDemoOverlay && "pointer-events-none select-none",
        )}
      >
        {children}
      </div>

      {showDemoOverlay ? (
        <div
          aria-label={t("demoSurfaceAriaLabel")}
          className="pointer-events-auto absolute inset-0 z-40 overflow-hidden rounded-[var(--radius-card)] backdrop-blur-md sm:rounded-[var(--radius-xl)] transition-[backdrop-filter] duration-200"
        >
          {showActions ? (
            <div className="flex h-full w-full items-center justify-center px-6">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={exploreDemo}
                  className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
                >
                  {t("demoExplore")}
                </button>
                <button
                  type="button"
                  onClick={clearDemoData}
                  className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-5 text-sm font-bold text-white shadow-[0_0_30px_-2px_var(--color-primary)] transition-all hover:brightness-105"
                >
                  {t("demoClearData")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
