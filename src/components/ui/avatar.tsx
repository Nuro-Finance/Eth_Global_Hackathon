/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "overflow-hidden cursor-pointer",
  {
    variants: {
      variant: {
        rounded: "rounded-full",
        square: "rounded-lg",
        soft: "rounded-xl",
      },
      size: {
        xs: "w-[24px] h-[24px]",
        sm: "w-[32px] h-[32px]",
        md: "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px]",
        lg: "w-[56px] h-[56px] sm:w-[64px] sm:h-[64px]",
        xl: "w-[72px] h-[72px] sm:w-[80px] sm:h-[80px]",
      },
      border: {
        none: "",
        default: "border-2 border-[var(--color-border-primary)]",
        primary: "border-2 border-[var(--color-primary)]",
        white: "border-2 border-[var(--color-border-tertiary)]",
      },
    },
    defaultVariants: {
      variant: "rounded",
      size: "md",
      border: "none",
    },
  }
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  /** Image source URL */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback content when no image (initials, icon, etc.) */
  fallback?: React.ReactNode;
}

/**
 * Avatar - Reusable avatar component with multiple variants
 *
 * Variants:
 * - rounded: Full circle (default)
 * - square: Rounded corners
 * - soft: Extra rounded corners
 *
 * Sizes: xs, sm, md (default), lg, xl
 * Border: none (default), default, primary, white
 */
const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, variant, size, border, src, alt = "", fallback, ...props },
    ref
  ) => {
    const [hasError, setHasError] = React.useState(false);

    return (
      <div
        ref={ref}
        className={cn(avatarVariants({ variant, size, border }), className)}
        {...props}
      >
        {src && !hasError ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        ) : fallback ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
            {fallback}
          </div>
        ) : (
          <div className="w-full h-full bg-[var(--color-bg-hover)]" />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };
