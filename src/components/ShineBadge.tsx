"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShineBadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "success"
    | "warning"
    | "error";
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

const variantStyles = {
  default: "bg-[var(--color-brand-surface)] text-[var(--color-text-primary)]",
  outline:
    "bg-transparent border-[0.5px] border-[var(--color-border-input)] text-[var(--color-text-primary)]",
  secondary:
    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border-[0.5px] border-[var(--color-border-input)]",
  success: "bg-[var(--color-success)] text-[var(--color-button-text)]",
  warning: "bg-[var(--color-warning)] text-[var(--color-button-text)]",
  error: "bg-[var(--color-error-light)] text-[var(--color-button-text)]",
};

export function ShineBadge({
  children,
  className,
  variant = "default",
  size = "md",
}: ShineBadgeProps) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes shine {
            0% {
              transform: translateX(-100%) skewX(-12deg);
            }
            100% {
              transform: translateX(300%) skewX(-12deg);
            }
          }
          .animate-shine {
            animation: shine 3s ease-in-out infinite;
          }
          .shine-overlay {
            background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.6), transparent);
          }
          .dark .shine-overlay {
            background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent);
          }
        `,
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full font-medium",
          "overflow-hidden group cursor-default",
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
      >
        {/* Shine effect - uses CSS for proper light/dark mode */}
        <div className="shine-overlay absolute inset-0 -top-2 -bottom-2 w-[50%] transform -skew-x-12 animate-shine" />

        {/* Content */}
        <span className="relative z-10">{children}</span>
      </motion.div>
    </>
  );
}
