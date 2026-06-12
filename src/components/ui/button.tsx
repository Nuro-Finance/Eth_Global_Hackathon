"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-[opacity,transform] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-cta-button-bg)] text-white hover:bg-[var(--color-cta-button-bg-hover)]",
        destructive:
          "bg-[var(--color-error)] text-[var(--color-text-primary)] hover:bg-[var(--color-error)]/90",
        outline:
          "border-[0.5px] border-[var(--color-border-input)] dark:border-[var(--color-border-input)] bg-transparent dark:bg-[var(--color-bg-input)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] transition-all duration-300",
        secondary:
          "bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-glass)] dark:border-[var(--color-border-glass)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/80 dark:hover:bg-[var(--color-bg-glass-strong)] border-[0.5px] border-[var(--color-border-input)]",
        ghost:
          "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
 /** Quiet glass control: subtle base fill, slightly brighter on hover + white label (dashboard / modal toolbars, pagination). */
        glassSm:
          "border-transparent bg-white/[0.04] text-white/70 shadow-none hover:bg-white/[0.055] hover:text-white active:bg-white/[0.08] transition-[background-color,color,border-color] duration-200 [&_svg]:transition-none",
        link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-[var(--radius-sm)] gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-[var(--radius-lg)] px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  iconPosition = "left",
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    icon?: React.ReactNode;
    iconPosition?: "left" | "right";
  }) {
  const Comp = asChild ? Slot : "button";

  if (asChild) {
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {icon && iconPosition === "left" && (
        <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
      {icon && iconPosition === "right" && (
        <span className="inline-flex shrink-0">{icon}</span>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
