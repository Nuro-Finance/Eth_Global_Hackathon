"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "transition-[opacity,transform] duration-200 glass-card-inner",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]",
        glass:
          "bg-[var(--color-bg-tertiary)]/50 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)]",
        elevated:
          "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] shadow-lg",
        outlined:
          "bg-transparent border-2 border-[var(--color-border-secondary)]",
      },
      size: {
        sm: "p-4 rounded-[var(--radius-sm)]",
        md: "p-6 rounded-[var(--radius-card)]",
        lg: "p-8 rounded-[var(--radius-xl)]",
      },
      interactive: {
        true: "cursor-pointer hover:bg-[var(--color-bg-hover)] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      interactive: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Whether to use framer-motion animations */
  animated?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, interactive, animated = false, onClick, children, ...props }, ref) => {
    if (animated) {
      return (
        <motion.div
          ref={ref}
          className={cn(cardVariants({ variant, size, interactive }), className)}
          onClick={onClick}
          {...(interactive && {
            whileHover: { scale: 1.02 },
            whileTap: { scale: 0.98 },
          })}
        >
          {children}
        </motion.div>
      );
    }
    
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, size, interactive }), className)}
        onClick={onClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight text-[var(--color-text-primary)]", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-[var(--color-text-muted)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
