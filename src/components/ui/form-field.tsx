import { forwardRef } from "react";
import { FieldError } from "react-hook-form";
import { Input, type InputProps } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps
  extends Omit<InputProps, "errorMessage" | "label" | "helperText"> {
  label: string;
  error?: FieldError;
  required?: boolean;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      id,
      label,
      placeholder,
      error,
      type = "text",
      required,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div className="space-y-3">
        <Label
          htmlFor={id}
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          {label} {required && "*"}
        </Label>
        <Input
          ref={ref}
          id={id}
          type={type}
          placeholder={placeholder}
          className={cn(
            "h-12 bg-[var(--color-bg-input)] dark:backdrop-blur-[var(--glass-blur)] border-[var(--color-border-input)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20",
          error && "border-[var(--color-error)] focus:border-[var(--color-error)]",
            className
          )}
          {...props}
        />
        {error && (
        <p className="text-sm text-[var(--color-error)] flex items-center gap-1">
            <span className="text-xs">⚠</span>
            {error.message}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = "FormField";
