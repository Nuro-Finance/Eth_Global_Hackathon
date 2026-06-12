"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type NuroCometCtaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  wrapperClassName?: string;
 /** Stretch CTA to container width; keeps orbit circular on wide rects. */
  fullWidth?: boolean;
};

/** Exact comet CTA from HeroKycFinishButton (Upgrade to Nuro+). Orbit markup unchanged unless `fullWidth`. */
export function NuroCometCtaButton({
  children,
  className,
  wrapperClassName,
  fullWidth = false,
  type = "button",
  style,
  ...props
}: NuroCometCtaButtonProps) {
  const buttonStyle: CSSProperties | undefined = fullWidth
    ? { ...style, containerType: "size" }
    : style;

  return (
    <div className={cn("relative group flex justify-center transform-gpu", fullWidth && "w-full", wrapperClassName)}>
      <button
        type={type}
        {...props}
        style={buttonStyle}
        className={cn(
          "relative inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-105 sm:min-h-11 sm:px-6 sm:py-3 sm:text-sm active:scale-[0.98] shadow-[0_0_30px_-2px_var(--color-primary)] overflow-visible transform-gpu",
          fullWidth && "w-full",
          className,
        )}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-[var(--radius-sm)] pointer-events-none"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1px",
          }}
        >
          <div className="absolute inset-0 bg-[var(--color-primary)]/30" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className={cn(
              "absolute rounded-full will-change-transform",
              fullWidth
                ? "left-1/2 top-1/2 aspect-square h-[400cqmax] w-[400cqmax] -translate-x-1/2 -translate-y-1/2"
                : "inset-[-150%]",
            )}
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, transparent 65%, var(--color-primary) 85%, var(--color-text-primary) 92%, var(--color-primary) 98%, transparent 100%)",
            }}
          />
        </div>

        <span className="relative z-20 inline-flex items-center justify-center gap-2">{children}</span>
      </button>
    </div>
  );
}
