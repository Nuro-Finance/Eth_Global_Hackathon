"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** How long the header “Just now” pill stays visible after a successful refresh. */
export const REFRESH_JUST_NOW_PILL_MS = 10_000;

export function useRefreshJustNowPill() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const showJustNow = useCallback(() => {
    setVisible(true);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, REFRESH_JUST_NOW_PILL_MS);
  }, []);

  const runRefresh = useCallback(
    async (refreshFn: () => Promise<void>) => {
      await refreshFn();
      showJustNow();
    },
    [showJustNow],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { justNowVisible: visible, runRefresh };
}

export function RefreshJustNowPill({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.span
          className="inline-flex h-6 shrink-0 items-center rounded-full bg-white/[0.04] px-2.5 text-[11px] font-semibold text-[var(--color-success)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
        >
          Just now
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
