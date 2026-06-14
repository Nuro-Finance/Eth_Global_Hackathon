"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "flex items-center justify-center cursor-pointer transition-[opacity,transform]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] text-[var(--color-text-muted)] dark:backdrop-blur-[var(--glass-blur)]",
        ghost:
          "bg-white/[0.03] hover:bg-white/[0.05] text-[var(--color-text-primary)] transition-all duration-200",
 /** Header / page toolbar only - sits on `--color-bg-primary`, matches nav shell. */
        canvas:
          "bg-white/[0.04] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] transition-all duration-200",
        outline:
          "bg-transparent border border-[var(--color-border-primary)] dark:border-[var(--color-border-input)] hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] text-[var(--color-text-muted)] dark:backdrop-blur-[var(--glass-blur)]",
        primary:
          "bg-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/30 text-[var(--color-primary)] dark:backdrop-blur-[var(--glass-blur)]",
        glass:
          "bg-[var(--color-bg-input)] dark:bg-[var(--color-bg-input)] backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-input)] hover:bg-[var(--color-bg-input-hover)] text-[var(--color-text-primary)]",
      },
      size: {
        sm: "w-8 h-8",
        md: "w-8 h-8",
        lg: "w-10 h-10 sm:w-11 sm:h-11",
      },
      rounded: {
        full: "rounded-full",
        xl: "rounded-[var(--radius-sm)]",
        lg: "rounded-lg",
        md: "rounded-md",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
      rounded: "xl",
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof iconButtonVariants> {
 /** Icon element to render */
  icon: React.ReactNode;
}

/**
 * IconButton - Reusable icon button component
 *
 * Variants: default, ghost (default), outline, primary
 * Sizes: sm, md (default), lg
 * Rounded: full, xl (default), lg, md
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, rounded, icon, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          iconButtonVariants({ variant, size, rounded }),
          className
        )}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
