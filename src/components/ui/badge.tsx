"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium transition-opacity focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-secondary-dark)] text-[var(--color-text-secondary)] border-[var(--color-border-input)] dark:border-[var(--color-border-input-dark)] hover:border-[var(--color-border-input)] dark:hover:border-[var(--color-border-input-dark)]",
        success:
          "bg-[var(--color-success)]/18 text-[var(--color-success)] border-[var(--color-success)]/50 hover:border-[var(--color-success)]/50",
        error:
          "bg-[var(--color-error-light)]/20 text-[var(--color-error-light)] border-[var(--color-error-light)]/55 hover:border-[var(--color-error-light)]/55",
        warning:
          "bg-[var(--color-warning)]/18 text-[var(--color-warning)] border-[var(--color-warning)]/45 hover:bg-[var(--color-warning)]/26",
        info: "bg-[var(--color-info)]/20 text-[var(--color-info)] border-[var(--color-info)]/30 hover:bg-[var(--color-info)]/30",
        primary:
          "bg-[var(--color-brand-surface)] dark:bg-[var(--color-brand-surface-dark)] text-[var(--color-brand-primary-light)] border-[var(--color-brand-border)] dark:border-[var(--color-brand-border-dark)] hover:bg-[var(--color-brand-surface)]/95 hover:opacity-90",
        secondary:
          "bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-tertiary-dark)] text-[var(--color-text-primary)] border-[var(--color-border-input)] dark:border-[var(--color-border-input-dark)] hover:bg-[var(--color-bg-hover)]/70",
        outline:
          "bg-transparent text-[var(--color-text-primary)] border-[var(--color-border-table)] dark:border-[var(--color-border-input)] hover:bg-[var(--color-bg-hover)]/40 text-[var(--color-text-secondary)]",
        plain: "bg-transparent border-transparent hover:bg-transparent",
      },
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-3 py-1 text-[12px]",
        lg: "px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
 /** Whether to show a dot indicator */
  dot?: boolean;
}

function Badge({
  className,
  variant,
  size,
  dot,
  children,
  ...props
}: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
