"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const DEFAULT_DURATION = 0.52;
const SNAP = { duration: 0 } as const;

type GradientCrossfadeLayersProps = {
  gradient: string;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
};

/** Opacity crossfade between gradients (linear-gradients don’t interpolate in CSS). */
export function GradientCrossfadeLayers({
  gradient,
  className,
  style,
  duration = DEFAULT_DURATION,
}: GradientCrossfadeLayersProps) {
  const [bottom, setBottom] = useState(gradient);
  const [top, setTop] = useState<string | null>(null);
  const isFirst = useRef(true);

  const fadeTransition = useMemo(
    () => ({ duration, ease: EASE }),
    [duration]
  );

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (gradient === bottom && top === null) return;
    if (gradient === bottom) return;
    setTop(gradient);
  }, [gradient, bottom, top]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 isolate overflow-hidden",
        className
      )}
      style={style}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: bottom }}
        initial={false}
        animate={{ opacity: top !== null ? 0 : 1 }}
        transition={top !== null ? fadeTransition : SNAP}
      />
      {top !== null && (
        <motion.div
          key={top}
          className="absolute inset-0"
          style={{ background: top }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fadeTransition}
          onAnimationComplete={() => {
            setBottom(top);
            setTop(null);
          }}
        />
      )}
    </div>
  );
}
