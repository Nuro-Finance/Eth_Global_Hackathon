"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const switchVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer rounded-full transition-[opacity,transform] duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "w-9 h-5",
        md: "w-12 h-6",
        lg: "w-14 h-7",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

const switchThumbVariants = cva(
  "absolute left-0 top-1/2 -translate-y-1/2 rounded-full transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform shadow-sm",
  {
    variants: {
      size: {
        sm: "w-4 h-4",
        md: "w-4 h-4",
        lg: "w-5 h-5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange">,
    VariantProps<typeof switchVariants> {
  checked: boolean;
  onChange: () => void;
 /** Optional class for the thumb only (defaults to white). */
  thumbClassName?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onChange, size, disabled, thumbClassName, ...props }, ref) => {
 // Transform-based movement is smoother than margin-based layout shifts.
    const getThumbTransform = () => {
      switch (size) {
        case "sm":
          return checked ? "translateX(18px)" : "translateX(2px)";
        case "lg":
          return checked ? "translateX(32px)" : "translateX(4px)";
        default:
          return checked ? "translateX(28px)" : "translateX(4px)";
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={cn(
          switchVariants({ size }),
          checked
            ? "bg-[var(--color-cta-button-bg)]"
            : "bg-[var(--color-switch-off)]",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            switchThumbVariants({ size }),
            thumbClassName ?? "bg-white"
          )}
          style={{ transform: getThumbTransform() }}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch, switchVariants };
