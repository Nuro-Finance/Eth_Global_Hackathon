"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full border transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-text-placeholder)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 autofill:bg-transparent [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--color-bg-input)_inset] [&:-webkit-autofill:hover]:[-webkit-box-shadow:0_0_0_1000px_var(--color-bg-input)_inset] [&:-webkit-autofill:focus]:[-webkit-box-shadow:0_0_0_1000px_var(--color-bg-input)_inset] [&:-webkit-autofill]:[text-fill-color:var(--color-text-primary)] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-text-primary)]",
  {
    variants: {
      variant: {
        default:
          "bg-transparent dark:bg-[var(--color-bg-input)] border-[var(--color-border-input)] dark:border-[var(--color-border-input)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus:border-[var(--color-border-input-focus)] dark:focus:border-[var(--color-border-input-focus)]",
        glass:
          "bg-transparent dark:bg-[var(--color-bg-input)] border-[var(--color-border-tertiary)] dark:border-[var(--color-border-input)] text-[var(--color-text-primary)] focus:border-[var(--color-border-input-focus)] dark:focus:border-[var(--color-border-input-focus)] focus:bg-[var(--color-bg-input-hover)] placeholder:text-[color-mix(in_srgb,var(--color-text-primary)_58%,transparent)]",
        search:
          "bg-white/3 border-white/10 dark:border-white/10 backdrop-blur-none text-[var(--color-text-primary)] focus:border-[var(--color-border-input-focus)] dark:focus:border-[var(--color-border-input-focus)] !rounded-[10px] transition-all duration-200",
        outlined:
          "bg-transparent border-[var(--color-border-tertiary)] text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 dark:focus:border-[var(--color-border-input-focus)]/50",
      },
      size: {
        sm: "h-8 px-3 py-2 text-sm rounded-[var(--radius-sm)]",
        md: "h-10 px-4 py-2 text-[14px] rounded-[var(--radius-md)]",
        lg: "h-12 px-4 py-3 text-base rounded-[var(--radius-lg)]",
      },
      state: {
        default: "",
        error:
          "border-[var(--color-error)] focus:border-[var(--color-error)] bg-[var(--color-error)]/10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      state: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  VariantProps<typeof inputVariants> {
 /** Error message to display */
  errorMessage?: string;
 /** Label text */
  label?: string;
 /** Helper text */
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      size,
      state,
      errorMessage,
      label,
      helperText,
      ...props
    },
    ref
  ) => {
    const effectiveState = errorMessage ? "error" : state;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-8">
            {label}
          </label>
        )}
        <input
          className={cn(
            inputVariants({ variant, size, state: effectiveState }),
            className
          )}
          ref={ref}
          {...props}
        />
        {errorMessage && (
          <p className="mt-1 text-sm text-[var(--color-error)]">
            {errorMessage}
          </p>
        )}
        {helperText && !errorMessage && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input, inputVariants };
