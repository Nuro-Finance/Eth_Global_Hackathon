"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type MouseEvent,
  type FocusEvent,
} from "react";
import { createPortal } from "react-dom";

const ICON_RAIL_PX = 40;
const GAP_PX = 8;
/** Matches SidebarProof nav row: `transition-colors duration-200 ease-in-out` / highlight `duration-200` */
const HOVER_SYNC_MS = 200;

type Side = "left" | "right";

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node);
      else if (ref && "current" in ref) (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

/**
 * Collapsed-rail labels without changing nav markup: positions the tooltip from the
 * left ~40px “icon column” of the full-width row (Radix + full-width triggers place tooltips too far right).
 */
export function SidebarRailTooltip({
  collapsed,
  label,
  side,
  mode = "rail-row",
  children,
}: {
  collapsed: boolean;
  label: string;
  side: Side;
 /** rail-row: full-width nav link (anchor using ~40px icon column). compact: small control (e.g. menu toggle). */
  mode?: "rail-row" | "compact";
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
 /** Opacity phase: fades in/out in lockstep with the row hover fill (same 200ms as nav). */
  const [fadeIn, setFadeIn] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const elRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const fadeInRef = useRef(false);
  openRef.current = open;
  fadeInRef.current = fadeIn;

  const updatePos = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    if (mode === "compact") {
      if (side === "right") {
        setPos({ top: midY, left: r.right + GAP_PX });
      } else {
        setPos({ top: midY, left: r.left - GAP_PX });
      }
      return;
    }
    if (side === "right") {
      setPos({ top: midY, left: r.left + ICON_RAIL_PX + GAP_PX });
    } else {
      setPos({ top: midY, left: r.left - GAP_PX });
    }
  }, [side, mode]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openTip = useCallback(() => {
    if (!collapsed || !label.trim()) return;
    clearCloseTimer();
    updatePos();
    if (openRef.current && !fadeInRef.current) {
      setFadeIn(true);
      return;
    }
    setOpen(true);
  }, [collapsed, label, updatePos, clearCloseTimer]);

  const closeTip = useCallback(() => {
    setFadeIn(false);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_SYNC_MS);
  }, [clearCloseTimer]);

  useLayoutEffect(() => {
    if (!open) {
      setFadeIn(false);
      return;
    }
    setFadeIn(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePos]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  if (!collapsed || !label.trim()) {
    return <>{children}</>;
  }

  if (!isValidElement(children)) {
    return <>{children}</>;
  }

  const childRef = (children as ReactElement & { ref?: React.Ref<HTMLElement> }).ref;

  const trigger = cloneElement(children, {
    ref: mergeRefs(elRef, childRef) as React.Ref<HTMLElement>,
    onMouseEnter: (e: MouseEvent) => {
      (children.props as { onMouseEnter?: (e: MouseEvent) => void }).onMouseEnter?.(e);
      openTip();
    },
    onMouseLeave: (e: MouseEvent) => {
      (children.props as { onMouseLeave?: (e: MouseEvent) => void }).onMouseLeave?.(e);
      closeTip();
    },
    onFocus: (e: FocusEvent) => {
      (children.props as { onFocus?: (e: FocusEvent) => void }).onFocus?.(e);
      openTip();
    },
    onBlur: (e: FocusEvent) => {
      (children.props as { onBlur?: (e: FocusEvent) => void }).onBlur?.(e);
      closeTip();
    },
  } as Record<string, unknown>);

  const tooltip =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        role="tooltip"
        style={{
          position: "fixed",
          top: pos.top,
          left: side === "right" ? pos.left : pos.left,
          transform: side === "right" ? "translateY(-50%)" : "translate(-100%, -50%)",
          zIndex: 10000,
          pointerEvents: "none",
          transitionDuration: `${HOVER_SYNC_MS}ms`,
          opacity: fadeIn ? 1 : 0,
        }}
        className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-white shadow-sm backdrop-blur-[6px] transition-opacity ease-in-out"
      >
        {label}
      </div>,
      document.body
    );

  return (
    <>
      {trigger}
      {tooltip}
    </>
  );
}
