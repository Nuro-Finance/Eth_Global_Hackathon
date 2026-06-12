"use client";

import { forwardRef } from "react";

interface IconButtonProps {
 /** Icon component to display */
  children: React.ReactNode;
 /** Click handler */
  onClick?: () => void;
 /** Button disabled state */
  disabled?: boolean;
 /** Accessibility label */
  "aria-label"?: string;
 /** Additional CSS classes */
  className?: string;
}

/**
 * Shared icon button component for header actions
 * Provides consistent styling for all header action buttons
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, onClick, disabled, className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        className={`w-9 h-9 flex items-center justify-center rounded-md hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

export default IconButton;
